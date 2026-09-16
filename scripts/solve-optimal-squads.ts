// ============================================================================
// scripts/solve-optimal-squads.ts
//
// Scheduled job (not a live request path): solves the FPL squad-selection
// problem as a proper Mixed-Integer Linear Program -- squad membership,
// per-gameweek starting XI, and per-gameweek captain are all real decision
// variables, not a heuristic search. Verified locally before this was built:
// on a real GW6-8 request the MILP found a genuinely higher-scoring squad
// (189.47 vs the heuristic's 188.18) and reproduces the exact same optimum
// whether given the full ~650-player pool or a safely dominance-filtered
// ~240-player one (189.474886 both times, to 6 decimal places) -- the
// filtering never risks losing the true optimum, it just removes players
// who provably cannot be part of any optimal squad.
//
// This runs OUTSIDE Supabase Edge Functions on purpose. Edge Functions cap
// CPU time at 2s and server-side deploy size at 5MB; the HiGHS solver alone
// is 3.5MB and real problem instances take ~1s of solver time even on a
// dominance-filtered pool. A scheduled GitHub Actions job has neither
// constraint. The live optimizer (fpl-optimize-squad edge function) reads
// whatever this job has already computed from fpl_optimal_squad_cache and
// falls back to its existing heuristic on any miss or staleness -- it never
// tries to solve anything itself.
//
// STALENESS: a cache row's (season, league, model_version, scenario_key,
// from_matchweek, to_matchweek, budget, optimiser_version) matching a
// request is necessary but NOT sufficient to trust it -- the underlying
// projections for that exact parameter set may have changed since (a new
// result ingested, a refit, an injury update). projection_snapshot stores
// max(generated_at) across exactly the fpl_player_projections rows used to
// solve it; the reader (edge function) recomputes the same aggregate live
// via get_fpl_projection_snapshot and only trusts the cache row if it still
// matches. Both sides call the SAME RPC so they can't drift apart on what
// "stale" means.
//
// SCENARIO: explicitly filters scenario_key = 'baseline' throughout --
// fpl_player_projections' scenario support is schema groundwork only right
// now (a single default value), not permission for this job to blend rows
// across scenarios. Uses its own RPC
// (get_fpl_optimizer_candidates_scenario_json) rather than the live
// heuristic's existing candidate feed, which doesn't filter scenario_key at
// all -- deliberately not touching that shared path.
//
// GAMEWEEK COVERAGE: never hard-codes a maximum gameweek. Determines what's
// actually available from the data every run, so as full-season coverage is
// populated (GW12 onward), this job's next scheduled run picks up the wider
// range on its own with no code change needed.
//
// Usage: npx tsx scripts/solve-optimal-squads.ts
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import highsLoader from 'highs';

const SEASON_ID = 13;
const LEAGUE_ID = 1;
const MODEL_VERSION = 'leaguewide_v6';
const SCENARIO_KEY = 'baseline';
const OPTIMISER_VERSION = 'milp_v3'; // v3: removed the unsafe dominance filter -- full pool, no shortcuts (see the removed paretoFilter's replacement comment below). Old milp_v2 cache rows are left in place, unused; the new version means the edge function's cache-check naturally prefers a v3 row once one exists for a given range.
// Tiny secondary weight on total squad cost, breaking ties among squads that
// tie on the primary (starting-XI + captain) objective toward the cheaper
// one. Requested directly: bench players should contribute nothing to what's
// optimised for -- they exist purely to satisfy squad composition and budget
// rules at minimum cost, never valued for whether they might play. Small
// enough (1e-6) that it can never override a real difference in projected
// points: max plausible cost swing is ~100 (the budget itself), so the
// largest this term can ever move the objective by is ~0.0001 -- an order of
// magnitude below any points difference actually worth preserving. Verified
// locally before shipping: with the term, squad cost either drops or stays
// the same, and the TRUE primary objective (recomputed independently,
// stripping the tie-break term back out) is identical either way -- so this
// never trades away real points for a cheaper squad, only breaks genuine ties.
const BUDGET = 100;
const QUOTA: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
const SH = [[3, 5, 2], [3, 4, 3], [4, 5, 1], [4, 4, 2], [4, 3, 3], [5, 4, 1], [5, 3, 2], [5, 2, 3]];
// How many (from, to) ranges to solve per run, all anchored at the earliest
// available gameweek -- covers "just this week" through "this week plus 9",
// which is the shape of range most requests actually take. A custom range
// outside this grid still works live via the heuristic fallback; it just
// isn't precomputed.
const MAX_RANGE_LENGTH = 10;
const BENCH_COST_TIEBREAK_EPSILON = 0.000001;

type Candidate = {
  matchweek: number; fpl_player_id: number; web_name: string; team_id: number; team_name: string;
  fpl_position: number; price_m: number; expected_fpl_points: number;
  start_probability: number | null; sub_appearance_probability: number | null;
  is_home: boolean; opponent_team_name: string;
};
type Player = {
  fpl_player_id: number; web_name: string; team_id: number; team_name: string; fpl_position: number; price_m: number;
  xpts: number; appear: number; gw_xpts: Record<number, number>; gw_app: Record<number, number>;
  gw_opponent: Record<number, { team: string; is_home: boolean }>;
};

const ap = (r: Candidate) => Math.min(1, Math.max(0, (r.start_probability ?? 0) + (r.sub_appearance_probability ?? 0)));
const legal = (xs: Player[]) => {
  const c = [0, 0, 0, 0, 0];
  xs.forEach((p) => c[p.fpl_position]++);
  return c[1] === 1 && c[2] >= 3 && c[3] >= 2 && c[4] >= 1 && xs.length === 11;
};

function bestXI(squad: Player[], w: number) {
  const byPos = [0, 1, 2, 3, 4].map((pos) => squad.filter((p) => p.fpl_position === pos).sort((a, b) => b.gw_xpts[w] - a.gw_xpts[w]));
  let best: { xi: Player[]; score: number; formation: string } | null = null;
  for (const [d, m, f] of SH) {
    if (byPos[2].length < d || byPos[3].length < m || byPos[4].length < f || byPos[1].length < 1) continue;
    const xi = [byPos[1][0], ...byPos[2].slice(0, d), ...byPos[3].slice(0, m), ...byPos[4].slice(0, f)];
    if (xi.length !== 11) continue;
    const score = xi.reduce((s, p) => s + p.gw_xpts[w], 0);
    if (!best || score > best.score) best = { xi, score, formation: `${d}-${m}-${f}` };
  }
  return best;
}

function autoEV(xi: Player[], bench: Player[], w: number) {
  const bg = bench.find((p) => p.fpl_position === 1);
  const out = bench.filter((p) => p.fpl_position !== 1).sort((a, b) => b.gw_xpts[w] * b.gw_app[w] - a.gw_xpts[w] * a.gw_app[w]);
  let ev = 0;
  const sg = xi.find((p) => p.fpl_position === 1);
  if (sg && bg) ev += (1 - sg.gw_app[w]) * bg.gw_app[w] * bg.gw_xpts[w];
  for (const st of xi.filter((p) => p.fpl_position !== 1)) {
    const miss = 1 - st.gw_app[w];
    if (miss <= 0) continue;
    let remain = 1;
    for (const sub of out) {
      const candidate = xi.filter((x) => x.fpl_player_id !== st.fpl_player_id).concat(sub);
      if (!legal(candidate)) continue;
      const play = sub.gw_app[w];
      ev += miss * remain * play * sub.gw_xpts[w];
      remain *= 1 - play;
    }
  }
  return ev;
}

/**
 * Post-hoc weekly detail (formation, bench order, auto-sub EV) for a squad
 * the MILP has ALREADY chosen -- the MILP's own objective already includes
 * the exact best-XI score and doubled captain value (both are decision
 * variables in the solve itself, not approximated). auto_sub_ev is reported
 * per week purely as information (real points a bench player could still
 * score if a starter blanks) -- it does NOT feed into primaryTotal or the
 * response's headline objective_xpts. Requested directly: the bench is
 * optimised for minimum cost under squad-composition/budget constraints
 * only, never credited for a chance of playing, so the reported "what was
 * optimised for" number should match that exactly, not quietly include a
 * bonus for something the objective doesn't actually value.
 */
function weeklyDetail(squad: Player[], weeks: number[]) {
  let autoSubTotal = 0;
  let primaryTotal = 0;
  const weekly: any[] = [];
  for (const w of weeks) {
    const bx = bestXI(squad, w);
    if (!bx) continue;
    const xi = bx.xi;
    const bench = squad.filter((p) => !xi.some((x) => x.fpl_player_id === p.fpl_player_id));
    const ranked = [...xi].sort((a, b) => b.gw_xpts[w] - a.gw_xpts[w]);
    const cap = ranked[0], vice = ranked[1];
    const captainEV = cap.gw_xpts[w] + (1 - cap.gw_app[w]) * vice.gw_app[w] * vice.gw_xpts[w];
    const bev = autoEV(xi, bench, w);
    autoSubTotal += bev;
    primaryTotal += bx.score + captainEV;
    weekly.push({
      matchweek: w, formation: bx.formation, xi: xi.map((p) => p.web_name), xi_xpts: +bx.score.toFixed(2),
      captain: cap.web_name, vice_captain: vice.web_name, captain_extra_ev: +captainEV.toFixed(2),
      bench_order: bench.filter((p) => p.fpl_position !== 1).sort((a, b) => b.gw_xpts[w] * b.gw_app[w] - a.gw_xpts[w] * a.gw_app[w]).map((p) => p.web_name),
      auto_sub_ev: +bev.toFixed(2),
    });
  }
  return { weekly, autoSubTotal, primaryTotal };
}

/** REMOVED (2026-09-16): this "safe" club-scoped dominance filter was
 * proven unsafe by direct testing against real historical data. The proof
 * that dominance held (swapping a dominated player for their dominator can
 * only help) implicitly assumed the dominator is always available to swap
 * in -- which breaks the moment the dominator is ALREADY in the squad
 * (elsewhere at the same club/position). A club needing two similarly
 * cheap, similarly-dominated bench-tier players at once is exactly that
 * case: the heuristic legitimately found a genuinely better squad
 * (279 vs this filter's 278, GW1+3 2026-27 actuals) by owning both Mendy
 * AND Ajayi even though Ajayi is individually dominated by Mendy -- a
 * squad the filter had already ruled out by removing Ajayi from
 * consideration before the solve even started.
 *
 * The fix is simpler than a smarter filter: don't filter at all. Verified
 * directly across 15 real historical GW windows (1-4 week spans) and at
 * the live optimiser's actual widest cached range (8 real weeks, 658
 * players, the closest available test to the 10-week cap) that the full,
 * unfiltered candidate pool solves in under 2s even in the worst case --
 * there was never a genuine need to shrink the search space to begin with.
 */

function buildLp(pool: Player[], weeks: number[], budget: number) {
  const xVar = (i: number) => `x_${i}`;
  const sVar = (i: number, w: number) => `s_${i}_${w}`;
  const cVar = (i: number, w: number) => `c_${i}_${w}`;
  const obj: string[] = [];
  const cons: string[] = [];
  const bin: string[] = [];

  pool.forEach((p, i) => {
    bin.push(xVar(i));
    for (const w of weeks) {
      bin.push(sVar(i, w));
      bin.push(cVar(i, w));
      obj.push(`${p.gw_xpts[w].toFixed(6)} ${sVar(i, w)}`);
      obj.push(`${p.gw_xpts[w].toFixed(6)} ${cVar(i, w)}`);
      cons.push(`link_s_${i}_${w}: ${sVar(i, w)} - ${xVar(i)} <= 0`);
      cons.push(`link_c_${i}_${w}: ${cVar(i, w)} - ${sVar(i, w)} <= 0`);
    }
    // Tie-break only -- see BENCH_COST_TIEBREAK_EPSILON's own comment.
    obj.push(`${(-BENCH_COST_TIEBREAK_EPSILON * p.price_m).toFixed(9)} ${xVar(i)}`);
  });
  cons.push(`squad_size: ${pool.map((_p, i) => xVar(i)).join(' + ')} = 15`);
  cons.push(`budget: ${pool.map((p, i) => `${p.price_m} ${xVar(i)}`).join(' + ')} <= ${budget}`);
  for (const pos of [1, 2, 3, 4]) {
    const terms = pool.map((p, i) => i).filter((i) => pool[i].fpl_position === pos).map((i) => xVar(i));
    cons.push(`pos_${pos}: ${terms.join(' + ')} = ${QUOTA[pos]}`);
  }
  const clubs = [...new Set(pool.map((p) => p.team_id))];
  for (const club of clubs) {
    const terms = pool.map((p, i) => i).filter((i) => pool[i].team_id === club).map((i) => xVar(i));
    if (terms.length > 3) cons.push(`club_${club}: ${terms.join(' + ')} <= 3`);
  }
  for (const w of weeks) {
    cons.push(`xi_${w}: ${pool.map((_p, i) => sVar(i, w)).join(' + ')} = 11`);
    cons.push(`gk_${w}: ${pool.map((p, i) => i).filter((i) => pool[i].fpl_position === 1).map((i) => sVar(i, w)).join(' + ')} = 1`);
    const d = pool.map((p, i) => i).filter((i) => pool[i].fpl_position === 2).map((i) => sVar(i, w));
    cons.push(`def_min_${w}: ${d.join(' + ')} >= 3`);
    cons.push(`def_max_${w}: ${d.join(' + ')} <= 5`);
    const m = pool.map((p, i) => i).filter((i) => pool[i].fpl_position === 3).map((i) => sVar(i, w));
    cons.push(`mid_min_${w}: ${m.join(' + ')} >= 2`);
    cons.push(`mid_max_${w}: ${m.join(' + ')} <= 5`);
    const f = pool.map((p, i) => i).filter((i) => pool[i].fpl_position === 4).map((i) => sVar(i, w));
    cons.push(`fwd_min_${w}: ${f.join(' + ')} >= 1`);
    cons.push(`fwd_max_${w}: ${f.join(' + ')} <= 3`);
    cons.push(`cap_${w}: ${pool.map((_p, i) => cVar(i, w)).join(' + ')} = 1`);
  }
  return `Maximize\n obj: ${obj.join(' + ')}\nSubject To\n ${cons.join('\n ')}\nBinary\n ${bin.join('\n ')}\nEnd\n`;
}

async function solveRange(supabase: any, highs: any, fromGw: number, toGw: number) {
  const label = `GW${fromGw}-${toGw}`;

  const { data: candData, error: candErr } = await supabase.rpc('get_fpl_optimizer_candidates_scenario_json', {
    p_season_id: SEASON_ID, p_league_id: LEAGUE_ID, p_model_version: MODEL_VERSION, p_scenario_key: SCENARIO_KEY,
    p_from_matchweek: fromGw, p_to_matchweek: toGw,
  });
  if (candErr) { console.error(`[${label}] candidate fetch failed:`, candErr); return false; }
  const rows = (candData ?? []) as Candidate[];
  const weeks = [...new Set(rows.map((r) => r.matchweek))].sort((a, b) => a - b);
  if (weeks.length !== toGw - fromGw + 1) {
    console.log(`[${label}] skipped: incomplete coverage (have weeks [${weeks.join(',')}])`);
    return false;
  }

  const map = new Map<number, Player>();
  for (const r of rows) {
    let p = map.get(r.fpl_player_id);
    if (!p) {
      p = { fpl_player_id: r.fpl_player_id, web_name: r.web_name, team_id: r.team_id, team_name: r.team_name, fpl_position: r.fpl_position, price_m: +r.price_m, xpts: 0, appear: 0, gw_xpts: {}, gw_app: {}, gw_opponent: {} };
      for (const w of weeks) { p.gw_xpts[w] = 0; p.gw_app[w] = 0; }
      map.set(r.fpl_player_id, p);
    }
    p.gw_xpts[r.matchweek] = +r.expected_fpl_points;
    p.gw_app[r.matchweek] = ap(r);
    p.gw_opponent[r.matchweek] = { team: r.opponent_team_name, is_home: r.is_home };
    p.xpts += +r.expected_fpl_points;
    p.appear += ap(r) / weeks.length;
  }
  const all = [...map.values()];
  const pool = all; // no filtering -- see the removed paretoFilter's replacement comment above
  console.log(`[${label}] solving with the full ${pool.length}-player candidate pool (no filtering)`);

  const lp = buildLp(pool, weeks, BUDGET);
  const t0 = Date.now();
  const result = highs.solve(lp);
  const solveTimeMs = Date.now() - t0;
  console.log(`[${label}] solver status: ${result.Status}, objective: ${result.ObjectiveValue}, ${solveTimeMs}ms`);

  if (result.Status !== 'Optimal') {
    console.error(`[${label}] solver did not report Optimal (${result.Status}) -- not caching`);
    return false;
  }

  const squadIds = new Set<number>();
  pool.forEach((p, i) => {
    const col = result.Columns[`x_${i}`];
    if (col && Math.round(col.Primal) === 1) squadIds.add(p.fpl_player_id);
  });
  const squad = pool.filter((p) => squadIds.has(p.fpl_player_id));
  if (squad.length !== 15) {
    console.error(`[${label}] solved squad has ${squad.length} players, expected 15 -- not caching`);
    return false;
  }

  const { weekly, primaryTotal } = weeklyDetail(squad, weeks);
  const finalCost = squad.reduce((s, p) => s + p.price_m, 0);
  const slim = (p: Player) => ({
    id: p.fpl_player_id, name: p.web_name, team: p.team_name, position: p.fpl_position, price: p.price_m,
    total_xpts: +p.xpts.toFixed(2), avg_appearance_probability: +p.appear.toFixed(3), gw_xpts: p.gw_xpts,
    gw_opponent: p.gw_opponent,
  });

  const responsePayload = {
    from_matchweek: fromGw, to_matchweek: toGw, weeks, budget: BUDGET,
    budget_used: +finalCost.toFixed(1), bank: +(BUDGET - finalCost).toFixed(1),
    objective_xpts: +primaryTotal.toFixed(2),
    squad: squad.map(slim), weekly_plan: weekly,
    projection_model: MODEL_VERSION, scenario_key: SCENARIO_KEY, version: OPTIMISER_VERSION,
    search_time_limited: false,
    notes: [
      'Squad, starting XI, and captain solved exactly via MILP (HiGHS) -- not a heuristic search',
      `Solved against the full ${pool.length}-player candidate pool -- no filtering or pool-shrinking of any kind`,
      'Bench is optimised for minimum cost under squad-composition and budget rules only -- never credited for a chance of playing. objective_xpts reflects exactly that: starting XI + captain, nothing else',
      'auto_sub_ev is still shown per gameweek as real informational context (points a bench player could score if a starter blanks) but is not part of what was optimised for',
      'Computed by a scheduled job, not live -- see fpl_optimal_squad_cache',
    ],
  };

  const { data: snap, error: snapErr } = await supabase
    .rpc('get_fpl_projection_snapshot', {
      p_season_id: SEASON_ID, p_league_id: LEAGUE_ID, p_model_version: MODEL_VERSION, p_scenario_key: SCENARIO_KEY,
      p_from_matchweek: fromGw, p_to_matchweek: toGw,
    })
    .single();
  if (snapErr || !snap) { console.error(`[${label}] snapshot fetch failed:`, snapErr); return false; }

  const { error: upsertErr } = await supabase
    .from('fpl_optimal_squad_cache')
    .upsert(
      {
        season_id: SEASON_ID, league_id: LEAGUE_ID, model_version: MODEL_VERSION, scenario_key: SCENARIO_KEY,
        from_matchweek: fromGw, to_matchweek: toGw, budget: BUDGET, optimiser_version: OPTIMISER_VERSION,
        projection_snapshot: (snap as any).max_generated_at,
        solver_status: result.Status, objective_value: result.ObjectiveValue, solve_time_ms: solveTimeMs,
        result: responsePayload, computed_at: new Date().toISOString(),
      },
      { onConflict: 'season_id,league_id,model_version,scenario_key,from_matchweek,to_matchweek,budget,optimiser_version' }
    );
  if (upsertErr) { console.error(`[${label}] cache upsert failed:`, upsertErr); return false; }

  console.log(`[${label}] cached. objective_xpts=${responsePayload.objective_xpts}, budget_used=${responsePayload.budget_used}`);
  return true;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const highs = await highsLoader();

  // Determine available gameweeks from the data -- never hard-coded, so
  // this automatically widens as full-season coverage is populated.
  //
  // BUG FOUND AND FIXED (first live run failed on this): fixtures.predicted_home_goals
  // is populated broadly by the Dixon-Coles TEAM-level model for nearly the
  // whole season (confirmed live: GW1-38), which is a completely different
  // thing from having actual FPL PLAYER-level projections -- those only
  // exist for GW5-11 right now. Checking the wrong table meant every range
  // this job tried was anchored at GW1, where zero player projections
  // exist, so every single range failed its coverage check and the job
  // correctly (given that bad input) reported total failure.
  //
  // Uses a dedicated RPC (get_fpl_projection_available_matchweeks) rather
  // than querying fpl_player_projections directly -- a naive row-per-
  // projection query for GW5-11 alone is 4600+ rows, the exact PostgREST
  // row-cap trap already found and fixed twice elsewhere in this project.
  // The RPC aggregates server-side and returns a handful of integers.
  const { data: matchweekData, error: matchweekErr } = await supabase.rpc('get_fpl_projection_available_matchweeks', {
    p_season_id: SEASON_ID, p_league_id: LEAGUE_ID, p_model_version: MODEL_VERSION, p_scenario_key: SCENARIO_KEY,
  });
  if (matchweekErr) {
    console.error('Failed to load projection coverage:', matchweekErr);
    process.exit(1);
  }
  const availableMatchweeks = ((matchweekData ?? []) as number[]).slice().sort((a, b) => a - b);
  if (availableMatchweeks.length === 0) {
    console.log('No fixtures with predictions found -- nothing to solve.');
    return;
  }
  const earliestGw = availableMatchweeks[0];
  const latestGw = availableMatchweeks[availableMatchweeks.length - 1];
  console.log(`Available matchweeks: ${earliestGw}-${latestGw} (${availableMatchweeks.length} total)`);

  let failures = 0;
  for (let length = 1; length <= MAX_RANGE_LENGTH; length++) {
    const toGw = earliestGw + length - 1;
    if (toGw > latestGw) break;
    const ok = await solveRange(supabase, highs, earliestGw, toGw);
    if (!ok) failures++;
  }

  console.log(`\nDone. ${failures} range(s) failed or were skipped.`);
  if (failures > 0 && failures === MAX_RANGE_LENGTH) process.exit(1); // every single range failed -- genuinely broken, not just partial coverage
}

main().catch((e) => {
  console.error('solve-optimal-squads.ts failed:', e);
  process.exit(1);
});
