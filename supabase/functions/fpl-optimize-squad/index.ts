// ============================================================================
// supabase/functions/fpl-optimize-squad/index.ts
//
// Squad optimiser behind /fpl (src/lib/fplOptimizerApi.ts). Public
// (verify_jwt = false): it only reads projections.
//
// 22 Oct 2026 (audit SEC-02): the source was only in the deployment (v25);
// committed here from that version with three changes:
//   - errors: a request problem (UserError) returns 400 with its message; any
//     other failure returns a generic 500 and is logged here, not returned
//     (it used to return Postgres message/code/details/hint to anyone);
//   - a cap on live searches (up to 15 s each; a cache hit is free):
//     public.fpl_optimizer_rate_ok(client) allows 4 a minute per client and
//     30 a minute overall, else 429;
//   - this header.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type R = {
  fpl_player_id: number; web_name: string; team_id: number; team_name: string;
  fpl_position: number; price_m: number; expected_fpl_points: number;
  start_probability: number | null; sub_appearance_probability: number | null;
  expected_minutes: number | null; matchweek: number;
  is_home: boolean; opponent_team_name: string;
};
type Week = Record<string, unknown>;
type P = R & { xpts: number; gw_xpts: Record<number, number>; gw_app: Record<number, number>; appear: number; gw_opponent: Record<number, { team: string; is_home: boolean }> };

const H = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, traceparent, tracestate, baggage",
  "access-control-allow-methods": "POST, OPTIONS",
};

// A problem with the request itself: its message is safe to show the caller.
class UserError extends Error {}

const SH = [[3, 5, 2], [3, 4, 3], [4, 5, 1], [4, 4, 2], [4, 3, 3], [5, 4, 1], [5, 3, 2], [5, 2, 3]];
const QUOTA: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
const ap = (r: R) => Math.min(1, Math.max(0, (r.start_probability ?? 0) + (r.sub_appearance_probability ?? 0)));
const legal = (xs: P[]) => { const c = [0, 0, 0, 0, 0]; xs.forEach(p => c[p.fpl_position]++); return c[1] === 1 && c[2] >= 3 && c[3] >= 2 && c[4] >= 1 && xs.length === 11 };

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message || String(e.name || "Error");
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = ["message", "code", "details", "hint"]
      .filter(k => typeof o[k] === "string" && (o[k] as string).length > 0)
      .map(k => `${k}: ${o[k]}`);
    if (parts.length > 0) return parts.join(" | ");
    try { const j = JSON.stringify(e); if (j && j !== "{}") return j; } catch { /* fall through */ }
  }
  return "Unknown error (no message available)";
}

// The caller, for the rate limit: Supabase's edge passes the client address.
function clientKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function bestXI(squad: P[], w: number) {
  const byPos = [0, 1, 2, 3, 4].map(pos => squad.filter(p => p.fpl_position === pos).sort((a, b) => b.gw_xpts[w] - a.gw_xpts[w]));
  let best: { xi: P[]; score: number; formation: string } | null = null;
  for (const [d, m, f] of SH) {
    if (byPos[2].length < d || byPos[3].length < m || byPos[4].length < f || byPos[1].length < 1) continue;
    const xi = [byPos[1][0], ...byPos[2].slice(0, d), ...byPos[3].slice(0, m), ...byPos[4].slice(0, f)];
    if (xi.length !== 11) continue;
    const score = xi.reduce((s, p) => s + p.gw_xpts[w], 0);
    if (!best || score > best.score) best = { xi, score, formation: `${d}-${m}-${f}` };
  }
  return best;
}

function autoEV(xi: P[], bench: P[], w: number) {
  const bg = bench.find(p => p.fpl_position === 1);
  const out = bench.filter(p => p.fpl_position !== 1).sort((a, b) => b.gw_xpts[w] * b.gw_app[w] - a.gw_xpts[w] * a.gw_app[w]);
  let ev = 0;
  const sg = xi.find(p => p.fpl_position === 1);
  if (sg && bg) ev += (1 - sg.gw_app[w]) * bg.gw_app[w] * bg.gw_xpts[w];
  for (const st of xi.filter(p => p.fpl_position !== 1)) {
    const miss = 1 - st.gw_app[w];
    if (miss <= 0) continue;
    let remain = 1;
    for (const sub of out) {
      const candidate = xi.filter(x => x.fpl_player_id !== st.fpl_player_id).concat(sub);
      if (!legal(candidate)) continue;
      const play = sub.gw_app[w];
      ev += miss * remain * play * sub.gw_xpts[w];
      remain *= 1 - play;
    }
  }
  return ev;
}

/**
 * Full objective for a 15-man squad: per-GW best XI + captaincy EV.
 * Captaincy is doubled correctly: bestXI's score already counts the
 * captain's points once (as a normal starter); captainEV adds one MORE copy
 * of the captain's own points on top, making his total contribution 2x.
 * The second term models the vice-captain fallback the same way -- if the
 * armband would transfer to vice (captain doesn't play, vice does), one more
 * copy of vice's own points is added, weighted by that joint probability.
 * Captain is chosen as whoever has the single highest gw_xpts among the XI
 * that week -- which can legitimately be a goalkeeper if his projected mean
 * genuinely exceeds every outfield starter's (confirmed live, GW6: Raya
 * captained over the whole forward line). That's mathematically consistent
 * with pure mean-maximisation, but doesn't account for variance/ceiling the
 * way a human captain pick usually does -- worth knowing, not fixed here.
 *
 * Deliberately does NOT include auto-sub EV in `total` (what actually drives
 * every decision below). Requested directly: the bench should be optimised
 * for minimum cost under squad-composition/budget rules only, never valued
 * for a chance of playing -- so it must never move the score the search
 * itself is chasing. auto_sub_ev is still computed and shown per week in
 * `weekly` as real informational context (a bench player's genuine expected
 * points if a starter blanks), it just isn't part of what's being optimised.
 */
function evaluate(squad: P[], weeks: number[]) {
  let total = 0;
  const weekly: Week[] = [];
  for (const w of weeks) {
    const bx = bestXI(squad, w);
    if (!bx) return null;
    const xi = bx.xi;
    const bench = squad.filter(p => !xi.some(x => x.fpl_player_id === p.fpl_player_id));
    const ranked = [...xi].sort((a, b) => b.gw_xpts[w] - a.gw_xpts[w]);
    const cap = ranked[0], vice = ranked[1];
    const captainEV = cap.gw_xpts[w] + (1 - cap.gw_app[w]) * vice.gw_app[w] * vice.gw_xpts[w];
    const bev = autoEV(xi, bench, w);
    total += bx.score + captainEV;
    weekly.push({
      matchweek: w, formation: bx.formation, xi: xi.map(p => p.web_name), xi_xpts: +bx.score.toFixed(2),
      captain: cap.web_name, vice_captain: vice.web_name, captain_extra_ev: +captainEV.toFixed(2),
      bench_order: bench.filter(p => p.fpl_position !== 1).sort((a, b) => b.gw_xpts[w] * b.gw_app[w] - a.gw_xpts[w] * a.gw_app[w]).map(p => p.web_name),
      auto_sub_ev: +bev.toFixed(2),
    });
  }
  return { score: total, weekly };
}

const cost = (squad: P[]) => squad.reduce((s, p) => s + p.price_m, 0);

/**
 * Runs the full seed -> budget-repair -> local-search -> bench-efficiency
 * pipeline once, optionally with a SET of players PINNED into the squad from
 * the start (never sold in repair, never swapped out in either search pass).
 * Pinning a single player is how the premium-anchor pass below tests "what
 * if this specific expensive player were forced in" as a genuine alternative
 * scenario. Pinning multiple is how user-chosen must-include constraints
 * work (requested directly: let someone force a specific player like
 * Haaland in, or Bogle, and see the genuinely best squad built around that
 * choice, rather than a fixed template with one slot swapped).
 */
function runPipeline(pool: P[], budget: number, weeks: number[], deadline: number, pinnedIds: Set<number> = new Set()) {
  const squad: P[] = [];
  const counts = new Map<number, number>();

  for (const id of pinnedIds) {
    const pinned = pool.find(p => p.fpl_player_id === id);
    if (pinned) { squad.push(pinned); counts.set(pinned.team_id, (counts.get(pinned.team_id) || 0) + 1); }
  }

  for (const pos of [1, 2, 3, 4]) {
    const already = squad.filter(p => p.fpl_position === pos).length;
    let need = QUOTA[pos] - already;
    if (need <= 0) continue;
    const ranked = pool.filter(p => p.fpl_position === pos && !pinnedIds.has(p.fpl_player_id)).sort((a, b) => b.xpts / b.price_m - a.xpts / a.price_m);
    for (const p of ranked) {
      if (!need) break;
      if ((counts.get(p.team_id) || 0) >= 3) continue;
      squad.push(p); counts.set(p.team_id, (counts.get(p.team_id) || 0) + 1); need--;
    }
    if (need) return null; // not enough eligible players at this position
  }

  let guard = 0;
  while (cost(squad) > budget && guard++ < 200) {
    let bestSwap: { i: number; p: P; ratio: number } | null = null;
    for (let i = 0; i < squad.length; i++) {
      const cur = squad[i];
      if (pinnedIds.has(cur.fpl_player_id)) continue;
      for (const cand of pool) {
        if (cand.fpl_position !== cur.fpl_position) continue;
        if (cand.price_m >= cur.price_m) continue;
        if (squad.some(s => s.fpl_player_id === cand.fpl_player_id)) continue;
        const c = new Map(counts); c.set(cur.team_id, (c.get(cur.team_id) || 1) - 1);
        if ((c.get(cand.team_id) || 0) >= 3) continue;
        const saved = cur.price_m - cand.price_m;
        const lost = Math.max(0, cur.xpts - cand.xpts);
        const ratio = lost / saved;
        if (!bestSwap || ratio < bestSwap.ratio) bestSwap = { i, p: cand, ratio };
      }
    }
    if (!bestSwap) break;
    const old = squad[bestSwap.i];
    counts.set(old.team_id, (counts.get(old.team_id) || 1) - 1);
    squad[bestSwap.i] = bestSwap.p;
    counts.set(bestSwap.p.team_id, (counts.get(bestSwap.p.team_id) || 0) + 1);
  }
  if (cost(squad) > budget) return null;

  let current = evaluate(squad, weeks);
  if (!current) return null;
  let improved = true, passes = 0;
  while (improved && Date.now() < deadline && passes++ < 12) {
    improved = false;
    for (let i = 0; i < squad.length && Date.now() < deadline; i++) {
      const cur = squad[i];
      if (pinnedIds.has(cur.fpl_player_id)) continue;
      let bestCand: { p: P; score: number; weekly: Week[] } | null = null;
      for (const cand of pool) {
        if (cand.fpl_position !== cur.fpl_position) continue;
        if (squad.some(s => s.fpl_player_id === cand.fpl_player_id)) continue;
        const newCost = cost(squad) - cur.price_m + cand.price_m;
        if (newCost > budget) continue;
        const c = new Map(counts); c.set(cur.team_id, (c.get(cur.team_id) || 1) - 1);
        if ((c.get(cand.team_id) || 0) >= 3) continue;
        const trial = [...squad]; trial[i] = cand;
        const res = evaluate(trial, weeks);
        if (res && res.score > (bestCand?.score ?? current!.score) + 1e-9) bestCand = { p: cand, score: res.score, weekly: res.weekly };
        if (Date.now() >= deadline) break;
      }
      if (bestCand) {
        counts.set(cur.team_id, (counts.get(cur.team_id) || 1) - 1);
        squad[i] = bestCand.p;
        counts.set(bestCand.p.team_id, (counts.get(bestCand.p.team_id) || 0) + 1);
        current = { score: bestCand.score, weekly: bestCand.weekly };
        improved = true;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Bench-efficiency pass.
  //
  // Now unconditional, not tolerance-based: since evaluate()'s score no
  // longer includes auto-sub EV at all, a player benched in EVERY requested
  // week contributes EXACTLY ZERO to the score by construction -- there's
  // no longer a genuine tradeoff to weigh a tolerance against. Swapping them
  // for the cheapest same-position, club-legal player who ALSO never starts
  // under the swap can only ever leave the score unchanged (both contribute
  // zero) or, in principle, marginally worse if the swap were to somehow
  // enable a different bestXI elsewhere -- guarded against directly below
  // by requiring the recomputed score not drop at all (not even the old
  // 0.5% tolerance), rather than trusting that by construction alone.
  // ---------------------------------------------------------------------
  const benchCounts = new Map<number, number>();
  for (const w of weeks) {
    const bx = bestXI(squad, w);
    if (!bx) continue;
    const startingIds = new Set(bx.xi.map(p => p.fpl_player_id));
    for (const p of squad) if (!startingIds.has(p.fpl_player_id)) benchCounts.set(p.fpl_player_id, (benchCounts.get(p.fpl_player_id) || 0) + 1);
  }
  for (let i = 0; i < squad.length; i++) {
    const cur = squad[i];
    if (pinnedIds.has(cur.fpl_player_id)) continue;
    const benchedWeeks = benchCounts.get(cur.fpl_player_id) || 0;
    if (benchedWeeks < weeks.length) continue;
    const preSwapScore = current!.score;
    const cheaper = pool
      .filter(p => p.fpl_position === cur.fpl_position && p.price_m < cur.price_m)
      .filter(p => !squad.some(s => s.fpl_player_id === p.fpl_player_id))
      .sort((a, b) => a.price_m - b.price_m);
    for (const cand of cheaper) {
      const c = new Map(counts); c.set(cur.team_id, (c.get(cur.team_id) || 1) - 1);
      if ((c.get(cand.team_id) || 0) >= 3) continue;
      const trial = [...squad]; trial[i] = cand;
      const res = evaluate(trial, weeks);
      if (res && res.score >= preSwapScore - 1e-9) {
        counts.set(cur.team_id, (counts.get(cur.team_id) || 1) - 1);
        squad[i] = cand;
        counts.set(cand.team_id, (counts.get(cand.team_id) || 0) + 1);
        current = res;
        break;
      }
    }
  }

  return { squad, current: current!, cost: cost(squad) };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: H });
  try {
    const b = await req.json().catch(() => ({}));
    const from = Number(b.from_matchweek ?? b.matchweek ?? 5);
    const to = Number(b.to_matchweek ?? from);
    const budget = Number(b.budget ?? 100);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from > 37)
      throw new UserError('Use a valid gameweek range within a single season (up to 38 GWs)');
    if (!Number.isFinite(budget) || budget <= 0 || budget > 200)
      throw new UserError('Use a budget between £0.1m and £200m');

    // User-chosen constraints -- e.g. "force Haaland in and show me the
    // genuinely best squad built around him" or "I don't want Player X at
    // all, find the best squad excluding him". These change the search
    // itself (a full re-run with different starting conditions), not just a
    // filter on the result, so a squad someone builds this way is a real
    // answer to "what's optimal GIVEN this constraint", not an approximation.
    const mustIncludeIds = new Set<number>(Array.isArray(b.must_include_ids) ? b.must_include_ids.map(Number).filter(Number.isInteger) : []);
    const mustExcludeIds = new Set<number>(Array.isArray(b.must_exclude_ids) ? b.must_exclude_ids.map(Number).filter(Number.isInteger) : []);
    for (const id of mustIncludeIds) if (mustExcludeIds.has(id)) throw new UserError(`Player ${id} is in both must_include_ids and must_exclude_ids`);
    const hasCustomConstraints = mustIncludeIds.size > 0 || mustExcludeIds.size > 0;

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ---------------------------------------------------------------------
    // MILP cache check.
    //
    // A scheduled job (scripts/solve-optimal-squads.ts, GitHub Actions, not
    // this edge function) solves the same problem exactly via a real
    // Mixed-Integer Linear Program and writes results to
    // fpl_optimal_squad_cache -- proven to find a genuinely better squad
    // than this heuristic on real data (189.47 vs 188.18 on a real GW6-8
    // request). This function never solves the MILP itself: Edge Functions
    // cap CPU time at 2s and deploy size at 5MB, and the solver alone is
    // 3.5MB -- both ruled it out running live.
    //
    // A cache row matching these exact parameters is necessary but not
    // sufficient to trust: the underlying projections for this exact
    // (season, league, model_version, scenario_key, GW range) may have
    // changed since it was solved (new results, a refit, an injury
    // update). get_fpl_projection_snapshot is the SAME function the
    // scheduled job calls to stamp a cache row at solve time, so comparing
    // its live result against the stored projection_snapshot can't drift
    // out of sync with what "stale" means on the writing side.
    //
    // Any miss, mismatch, or error here falls straight through to the
    // existing heuristic below -- this must never block the live optimizer.
    // ---------------------------------------------------------------------
    const MILP_MODEL_VERSION = 'leaguewide_v6';
    const MILP_SCENARIO_KEY = 'baseline';
    const MILP_SEASON_ID = 13;
    const MILP_LEAGUE_ID = 1;
    if (!hasCustomConstraints) try {
      const { data: cacheRow, error: cacheErr } = await sb
        .from('fpl_optimal_squad_cache')
        .select('projection_snapshot, result, optimiser_version, computed_at')
        .eq('season_id', MILP_SEASON_ID)
        .eq('league_id', MILP_LEAGUE_ID)
        .eq('model_version', MILP_MODEL_VERSION)
        .eq('scenario_key', MILP_SCENARIO_KEY)
        .eq('from_matchweek', from)
        .eq('to_matchweek', to)
        .eq('budget', budget)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cacheErr && cacheRow) {
        const { data: snap, error: snapErr } = await sb
          .rpc('get_fpl_projection_snapshot', {
            p_season_id: MILP_SEASON_ID, p_league_id: MILP_LEAGUE_ID, p_model_version: MILP_MODEL_VERSION,
            p_scenario_key: MILP_SCENARIO_KEY, p_from_matchweek: from, p_to_matchweek: to,
          })
          .single();
        if (!snapErr && snap && (snap as { max_generated_at?: string }).max_generated_at === cacheRow.projection_snapshot) {
          console.log(`MILP cache hit: GW${from}-${to} £${budget}m, optimiser=${cacheRow.optimiser_version}, computed_at=${cacheRow.computed_at}`);
          return new Response(JSON.stringify({ ...(cacheRow.result as object), source: 'milp_cache' }), { headers: H });
        }
        console.log(`MILP cache present but stale for GW${from}-${to} £${budget}m -- falling back to heuristic`);
      }
    } catch (cacheException) {
      console.log('MILP cache check failed, falling back to heuristic:', describeError(cacheException));
    }

    // Live search from here (up to 15 s of compute): rate limited (SEC-02).
    // If the limiter itself errors, the request goes ahead.
    const { data: allowed, error: rateErr } = await sb.rpc('fpl_optimizer_rate_ok', { p_client: clientKey(req) });
    if (rateErr) console.error('fpl_optimizer_rate_ok failed:', describeError(rateErr));
    else if (allowed === false) {
      return new Response(JSON.stringify({ error: 'Too many squad searches right now. Wait a minute and try again.' }), { status: 429, headers: H });
    }

    const { data, error } = await sb.rpc('get_fpl_optimizer_candidates_json', {
      p_from_matchweek: from,
      p_to_matchweek: to,
    });
    if (error) { console.error('candidate feed RPC failed:', JSON.stringify(error)); throw error; }
    const rows = (data ?? []) as R[];
    const weeks = [...new Set(rows.map(r => +r.matchweek))].sort((a, b) => a - b);
    console.log(`fetched ${rows.length} rows across weeks [${weeks.join(',')}]`);
    if (weeks.length !== to - from + 1) throw new UserError(`Missing projections; available GWs: ${weeks.join(',')}`);

    const map = new Map<number, P>();
    for (const z of rows) {
      const r = { ...z, price_m: +z.price_m, expected_fpl_points: +z.expected_fpl_points, matchweek: +z.matchweek };
      let p = map.get(r.fpl_player_id);
      if (!p) {
        p = { ...r, xpts: 0, gw_xpts: {}, gw_app: {}, gw_opponent: {}, appear: 0 };
        for (const w of weeks) { p.gw_xpts[w] = 0; p.gw_app[w] = 0; }
        map.set(r.fpl_player_id, p);
      }
      p.gw_xpts[r.matchweek] = r.expected_fpl_points;
      p.gw_app[r.matchweek] = ap(r);
      p.gw_opponent[r.matchweek] = { team: r.opponent_team_name, is_home: r.is_home };
      p.xpts += r.expected_fpl_points;
      p.appear += ap(r) / weeks.length;
    }

    const all = [...map.values()].filter(p => !mustExcludeIds.has(p.fpl_player_id));
    const pool: P[] = [];
    for (const pos of [1, 2, 3, 4]) {
      const xs = all.filter(p => p.fpl_position === pos);
      const ids = new Set<number>();
      [...xs].sort((a, b) => b.xpts - a.xpts).slice(0, 30).forEach(p => ids.add(p.fpl_player_id));
      [...xs].sort((a, b) => b.xpts / b.price_m - a.xpts / a.price_m).slice(0, 30).forEach(p => ids.add(p.fpl_player_id));
      [...xs].filter(p => p.appear >= .75).sort((a, b) => a.price_m - b.price_m || b.appear - a.appear).slice(0, 25).forEach(p => ids.add(p.fpl_player_id));
      xs.filter(p => ids.has(p.fpl_player_id)).forEach(p => pool.push(p));
    }
    // A must-include player might not make the usual top-K cut (that's often
    // the whole point of asking for them) -- add them to the candidate pool
    // explicitly rather than relying on the heuristic ranking to surface them.
    for (const id of mustIncludeIds) {
      if (pool.some(p => p.fpl_player_id === id)) continue;
      const found = all.find(p => p.fpl_player_id === id);
      if (!found) throw new UserError(`Player ${id} (must_include_ids) has no projection for GW${from}-${to} -- check the ID or gameweek range`);
      pool.push(found);
    }
    console.log(`pool: ${pool.length} candidates from ${all.length} players (${mustExcludeIds.size} excluded, ${mustIncludeIds.size} forced in)`);

    // Sanity-check must-include feasibility before spending a search on it --
    // a clear error beats a confusing "could not assemble a squad" later.
    if (mustIncludeIds.size > 0) {
      const chosen = [...mustIncludeIds].map(id => pool.find(p => p.fpl_player_id === id)!).filter(Boolean);
      for (const pos of [1, 2, 3, 4]) {
        const n = chosen.filter(p => p.fpl_position === pos).length;
        if (n > QUOTA[pos]) throw new UserError(`Too many must-include players at position ${pos}: ${n} chosen, squad only has ${QUOTA[pos]} slot(s)`);
      }
      const byClub = new Map<number, number>();
      for (const p of chosen) byClub.set(p.team_id, (byClub.get(p.team_id) || 0) + 1);
      for (const [teamId, n] of byClub) if (n > 3) throw new UserError(`Too many must-include players from the same club (team ${teamId}): ${n} chosen, max 3 allowed`);
      const mustCost = chosen.reduce((s, p) => s + p.price_m, 0);
      if (mustCost > budget) throw new UserError(`Must-include players alone cost £${mustCost.toFixed(1)}m, over the £${budget}m budget`);
    }

    const HARD_DEADLINE = Date.now() + 15000;

    // Default run -- unconstrained except for any must-include/exclude the
    // user chose. Custom constraints skip the cache above (which only ever
    // stores the fully unconstrained optimum), so this always runs live.
    const defaultDeadline = Math.min(HARD_DEADLINE, Date.now() + 6000);
    const defaultResult = runPipeline(pool, budget, weeks, defaultDeadline, mustIncludeIds);
    if (!defaultResult) throw new UserError(`Could not assemble a squad within £${budget}m from the available player pool${hasCustomConstraints ? ' given the chosen must-include/exclude players' : ''}`);

    // ---------------------------------------------------------------------
    // Premium-anchor pass.
    //
    // Real limitation confirmed directly: the local search above only tries
    // ONE swap at a time, so it can miss a genuinely better squad that
    // requires displacing several cheaper players simultaneously to afford
    // one expensive one -- each individual step looks worse before the full
    // multi-step transition pays off, so hill-climbing search never finds
    // its way there on its own. Confirmed live on a real GW6 request:
    // forcing Haaland (£15.5m) in and re-optimising around him scored 0.85
    // points HIGHER than the unconstrained search's own result, which
    // matched leaving him out entirely -- the search wasn't rejecting him
    // on the merits, it just never tried him at all.
    //
    // Fix: explicitly re-run the full pipeline with each of the next-most-
    // expensive candidates NOT already in the default squad pinned in, and
    // keep whichever variant -- default or anchored -- scores highest. This
    // doesn't make the search exhaustive (still not a proven global
    // optimum), but it specifically closes the "expensive premium player
    // wrongly overlooked" gap, which is the one demonstrated case, rather
    // than leaving it to chance.
    // ---------------------------------------------------------------------
    let best = defaultResult;
    let bestLabel = 'default (unconstrained) search';
    const alreadyIn = new Set(defaultResult.squad.map(p => p.fpl_player_id));
    const anchorCandidates = [...pool]
      .filter(p => !alreadyIn.has(p.fpl_player_id))
      .sort((a, b) => b.price_m - a.price_m)
      .slice(0, 5);
    const anchorsTried: { name: string; price: number; score: number; beat_default: boolean }[] = [];
    for (const anchor of anchorCandidates) {
      if (Date.now() >= HARD_DEADLINE) break;
      const anchorDeadline = Math.min(HARD_DEADLINE, Date.now() + 1800);
      const res = runPipeline(pool, budget, weeks, anchorDeadline, new Set([...mustIncludeIds, anchor.fpl_player_id]));
      if (!res) continue;
      const beat = res.current.score > best.current.score + 1e-9;
      anchorsTried.push({ name: anchor.web_name, price: anchor.price_m, score: +res.current.score.toFixed(2), beat_default: beat });
      if (beat) { best = res; bestLabel = `anchored on ${anchor.web_name} (£${anchor.price_m}m)`; }
    }
    console.log(`premium-anchor pass: tried ${anchorsTried.length} candidates, best=${bestLabel}, score=${best.current.score.toFixed(2)}`);

    const { squad, current } = best;
    const hitDeadline = Date.now() >= HARD_DEADLINE;
    const finalCost = cost(squad);
    const slim = (p: P) => ({
      id: p.fpl_player_id, name: p.web_name, team: p.team_name, position: p.fpl_position, price: p.price_m,
      total_xpts: +p.xpts.toFixed(2), avg_appearance_probability: +p.appear.toFixed(3), gw_xpts: p.gw_xpts,
      gw_opponent: p.gw_opponent,
    });

    const notes = [
      'One 15-player squad over requested range',
      'Best legal XI and formation selected independently each GW',
      'Captain and vice selected independently each GW -- doubled correctly, but chosen by mean projected points only, which can select a goalkeeper over an attacker with more ceiling/variance if his mean happens to be higher that week',
      'Auto-sub EV uses per-GW appearance probabilities, bench order and legal formation checks',
      'Bench optimised for minimum cost under squad-composition and budget rules only, unconditionally for any player benched every requested week -- never credited for a chance of playing. Auto-sub EV is still shown per gameweek as real informational context but is not part of the objective',
      'Transfers between GWs not simulated',
      `Selection uses greedy seeding, local search, and an explicit premium-anchor pass (tried ${anchorsTried.length} of the most expensive unpicked candidates as forced-in alternatives) -- a strong squad, still not a proven global optimum`,
      `Result: ${bestLabel}`,
    ];
    if (hasCustomConstraints) notes.push(`Custom request: ${mustIncludeIds.size} player(s) forced in, ${mustExcludeIds.size} excluded -- served live, not from the exact-MILP cache (which only stores the fully unconstrained optimum)`);
    if (hitDeadline) notes.push('Search stopped at its time budget -- result may improve slightly with a narrower GW range');

    return new Response(JSON.stringify({
      from_matchweek: from, to_matchweek: to, weeks, budget,
      budget_used: +finalCost.toFixed(1), bank: +(budget - finalCost).toFixed(1),
      objective_xpts: +current.score.toFixed(2),
      squad: squad.map(slim), weekly_plan: current.weekly,
      premium_anchors_tried: anchorsTried,
      must_include_ids: [...mustIncludeIds], must_exclude_ids: [...mustExcludeIds],
      projection_model: 'leaguewide_v6', version: 'v1.13', search_time_limited: hitDeadline, notes, source: 'heuristic',
    }), { headers: H });
  } catch (e) {
    if (e instanceof UserError) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: H });
    }
    // Logged in full, returned generic: database errors carry message, code,
    // details and hint (SEC-02).
    console.error('fpl-optimize-squad failed:', describeError(e), e);
    return new Response(JSON.stringify({ error: 'The squad optimiser failed. Try again in a minute.' }), { status: 500, headers: H });
  }
});
