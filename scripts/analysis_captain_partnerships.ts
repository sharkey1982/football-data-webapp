// ============================================================================
// scripts/analysis_captain_partnerships.ts
//
// One-off analysis (not a registered experiment; changes nothing on the
// site) for the FPL article "One captain or two?" (Chris, 8 Oct 2026).
//
// Inputs are exactly what the live optimiser reads: the candidate feed
// get_fpl_optimizer_candidates_json(from, to) (leaguewide_v6, baseline),
// with current prices. Two parts:
//
//  pairs    For a fixed first captain (Haaland), every other player as a
//           second captaincy option: weeks he'd take the armband, and the
//           rotation gain  SUM_t max(A_t, B_t) - SUM_t A_t.  Also named
//           pairs/trios for the case study, and vice-captain insurance at
//           the model's own appearance probabilities.
//
//  squads   The exact squad solve (same MILP as solve-hindsight-optimal.ts:
//           full pool, 15-man squad, budget, 3 per club, per-gameweek best
//           legal XI and captain) on projections, with forced-in and
//           excluded players per scenario, and a budget curve for the
//           marginal value of £1m. Fixed squad: no transfers. Each scenario
//           is solved twice: as published, and with the low-evidence
//           players removed (fewer than LOW_EVIDENCE_MINUTES this season
//           but a start probability of 0.6 or more -- the depth-chart
//           floor found on 8 Oct 2026). The model itself is not changed.
//
// Output: one analysis_results row, analysis_id 'captain_partnerships'.
//
//   npx tsx scripts/analysis_captain_partnerships.ts --from 6 --to 15
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import highsLoader from 'highs';

const QUOTA: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
const SH = [[3, 5, 2], [3, 4, 3], [4, 5, 1], [4, 4, 2], [4, 3, 3], [5, 4, 1], [5, 3, 2], [5, 2, 3]];
const EPS = 0.000001;
const LOW_EVIDENCE_MINUTES = 200;
const LOW_EVIDENCE_START = 0.6;

export type Player = {
  id: number; name: string; teamId: number; team: string; pos: number; price: number;
  own: number | null; seasonMinutes: number;
  xp: Record<number, number>; app: Record<number, number>; start: Record<number, number>; mins: Record<number, number>;
  opp: Record<number, string>; total: number;
};

// ---- captaincy arithmetic ---------------------------------------------------

/** Captain points (the armband's extra copy) per gameweek when the armband
 * goes to whichever of `ps` has the highest projection that week. */
export function captainPath(ps: Player[], weeks: number[]) {
  return weeks.map((w) => {
    let best = ps[0];
    for (const p of ps) if (p.xp[w] > best.xp[w] + 1e-12) best = p;
    return { gw: w, captain: best.name, points: best.xp[w] };
  });
}

export function rotationGain(a: Player, others: Player[], weeks: number[]) {
  const base = weeks.reduce((s, w) => s + a.xp[w], 0);
  const path = captainPath([a, ...others], weeks);
  const total = path.reduce((s, x) => s + x.points, 0);
  return { base, total, gain: total - base, path };
}

/** Expected extra points from the armband including the vice-captain rule:
 * if the captain doesn't appear, the vice's points are doubled instead. */
export function withVice(cap: Player, vice: Player, w: number) {
  return cap.xp[w] + (1 - cap.app[w]) * vice.app[w] * vice.xp[w];
}

// ---- exact squad solve --------------------------------------------------------

export function buildLp(pool: Player[], weeks: number[], budget: number, include: Set<number>, exclude: Set<number>) {
  const x = (i: number) => `x_${i}`, s = (i: number, w: number) => `s_${i}_${w}`, c = (i: number, w: number) => `c_${i}_${w}`;
  const obj: string[] = [], cons: string[] = [], bin: string[] = [];
  pool.forEach((p, i) => {
    bin.push(x(i));
    for (const w of weeks) {
      bin.push(s(i, w)); bin.push(c(i, w));
      obj.push(`${p.xp[w].toFixed(6)} ${s(i, w)}`);
      obj.push(`${p.xp[w].toFixed(6)} ${c(i, w)}`);
      cons.push(`ls_${i}_${w}: ${s(i, w)} - ${x(i)} <= 0`);
      cons.push(`lc_${i}_${w}: ${c(i, w)} - ${s(i, w)} <= 0`);
    }
    obj.push(`${(-EPS * p.price).toFixed(9)} ${x(i)}`);
    if (include.has(p.id)) cons.push(`inc_${i}: ${x(i)} = 1`);
    if (exclude.has(p.id)) cons.push(`exc_${i}: ${x(i)} = 0`);
  });
  cons.push(`size: ${pool.map((_p, i) => x(i)).join(' + ')} = 15`);
  cons.push(`budget: ${pool.map((p, i) => `${p.price} ${x(i)}`).join(' + ')} <= ${budget}`);
  const idx = (f: (p: Player) => boolean) => pool.map((p, i) => [p, i] as const).filter(([p]) => f(p)).map(([, i]) => i);
  for (const pos of [1, 2, 3, 4]) cons.push(`pos_${pos}: ${idx((p) => p.pos === pos).map(x).join(' + ')} = ${QUOTA[pos]}`);
  for (const club of new Set(pool.map((p) => p.teamId))) {
    const t = idx((p) => p.teamId === club);
    if (t.length > 3) cons.push(`club_${club}: ${t.map(x).join(' + ')} <= 3`);
  }
  for (const w of weeks) {
    const sw = (f: (p: Player) => boolean) => idx(f).map((i) => s(i, w)).join(' + ');
    cons.push(`xi_${w}: ${pool.map((_p, i) => s(i, w)).join(' + ')} = 11`);
    cons.push(`gk_${w}: ${sw((p) => p.pos === 1)} = 1`);
    cons.push(`dmin_${w}: ${sw((p) => p.pos === 2)} >= 3`); cons.push(`dmax_${w}: ${sw((p) => p.pos === 2)} <= 5`);
    cons.push(`mmin_${w}: ${sw((p) => p.pos === 3)} >= 2`); cons.push(`mmax_${w}: ${sw((p) => p.pos === 3)} <= 5`);
    cons.push(`fmin_${w}: ${sw((p) => p.pos === 4)} >= 1`); cons.push(`fmax_${w}: ${sw((p) => p.pos === 4)} <= 3`);
    cons.push(`cap_${w}: ${pool.map((_p, i) => c(i, w)).join(' + ')} = 1`);
  }
  return `Maximize\n obj: ${obj.join(' + ')}\nSubject To\n ${cons.join('\n ')}\nBinary\n ${bin.join('\n ')}\nEnd\n`;
}

export function bestXI(squad: Player[], w: number) {
  const byPos = [0, 1, 2, 3, 4].map((pos) => squad.filter((p) => p.pos === pos).sort((a, b) => b.xp[w] - a.xp[w]));
  let best: { xi: Player[]; score: number; formation: string } | null = null;
  for (const [d, m, f] of SH) {
    if (byPos[2].length < d || byPos[3].length < m || byPos[4].length < f || byPos[1].length < 1) continue;
    const xi = [byPos[1][0], ...byPos[2].slice(0, d), ...byPos[3].slice(0, m), ...byPos[4].slice(0, f)];
    const score = xi.reduce((t, p) => t + p.xp[w], 0);
    if (!best || score > best.score) best = { xi, score, formation: `${d}-${m}-${f}` };
  }
  return best!;
}

/** Same scoring as the live optimiser's evaluate(): XI + captain + vice hedge;
 * bench points (auto-subs) are reported but not counted, as on the site. */
export function describeSquad(squad: Player[], weeks: number[]) {
  let xiPts = 0, capPts = 0, viceHedge = 0, benchEv = 0;
  const weekly = weeks.map((w) => {
    const { xi, score, formation } = bestXI(squad, w);
    const ranked = [...xi].sort((a, b) => b.xp[w] - a.xp[w]);
    const cap = ranked[0], vice = ranked[1];
    const hedge = withVice(cap, vice, w) - cap.xp[w];
    const bench = squad.filter((p) => !xi.includes(p) && p.pos !== 1);
    // Bench cover: a starter who doesn't appear is replaced by the first
    // bench player who does (formation checks ignored: an approximation).
    let cover = 0;
    for (const st of xi.filter((p) => p.pos !== 1)) {
      let remain = 1 - st.app[w];
      for (const b of [...bench].sort((a, z) => z.xp[w] * z.app[w] - a.xp[w] * a.app[w])) {
        cover += remain * b.app[w] * b.xp[w];
        remain *= 1 - b.app[w];
      }
    }
    xiPts += score; capPts += cap.xp[w]; viceHedge += hedge; benchEv += cover;
    return { gw: w, formation, captain: cap.name, vice: vice.name, captain_points: +cap.xp[w].toFixed(2), xi_points: +score.toFixed(2) };
  });
  const cost = squad.reduce((t, p) => t + p.price, 0);
  return {
    total: +(xiPts + capPts + viceHedge).toFixed(2),
    xi_points: +xiPts.toFixed(2), captain_points: +capPts.toFixed(2), vice_hedge: +viceHedge.toFixed(3), bench_cover_ev: +benchEv.toFixed(2),
    cost: +cost.toFixed(1),
    squad: squad.sort((a, b) => a.pos - b.pos || b.price - a.price).map((p) => ({
      id: p.id, name: p.name, team: p.team, pos: p.pos, price: p.price, xp10: +p.total.toFixed(2),
      starts: weeks.filter((w) => bestXI(squad, w).xi.includes(p)).length,
      captaincies: weekly.filter((x) => x.captain === p.name).length,
      low_evidence: isLowEvidence(p),
    })),
    weekly,
  };
}

export function isLowEvidence(p: Player): boolean {
  const ws = Object.keys(p.start).map(Number);
  const mean = ws.reduce((t, w) => t + p.start[w], 0) / Math.max(1, ws.length);
  return p.seasonMinutes < LOW_EVIDENCE_MINUTES && mean >= LOW_EVIDENCE_START;
}

// ---- main -------------------------------------------------------------------------

async function main() {
  const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const from = arg('from', 6), to = arg('to', 15);
  const weeks = Array.from({ length: to - from + 1 }, (_v, i) => from + i);
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const highs = await highsLoader();

  const { data: feed, error } = await sb.rpc('get_fpl_optimizer_candidates_json', { p_from_matchweek: from, p_to_matchweek: to });
  if (error) throw error;
  const rows = (typeof feed === 'string' ? JSON.parse(feed) : feed) as any[];
  const { data: snap } = await sb.rpc('get_fpl_projection_snapshot', {
    p_season_id: 13, p_league_id: 1, p_model_version: 'leaguewide_v6', p_scenario_key: 'baseline', p_from_matchweek: from, p_to_matchweek: to,
  }).single();
  const { data: meta, error: metaErr } = await sb.from('fpl_players').select('fpl_player_id, minutes, selected_by_percent, status, chance_of_playing_next_round').eq('season_id', 13);
  if (metaErr) throw metaErr;
  const metaById = new Map((meta ?? []).map((m: any) => [m.fpl_player_id, m]));

  const players = new Map<number, Player>();
  let dupes = 0;
  for (const r of rows) {
    const id = +r.fpl_player_id, w = +r.matchweek;
    let p = players.get(id);
    if (!p) {
      const m: any = metaById.get(id) ?? {};
      p = { id, name: r.web_name, teamId: +r.team_id, team: r.team_name, pos: +r.fpl_position, price: +r.price_m,
        own: m.selected_by_percent != null ? +m.selected_by_percent : null, seasonMinutes: +(m.minutes ?? 0),
        xp: {}, app: {}, start: {}, mins: {}, opp: {}, total: 0 };
      for (const k of weeks) { p.xp[k] = 0; p.app[k] = 0; p.start[k] = 0; p.mins[k] = 0; }
      players.set(id, p);
    }
    if (p.opp[w]) dupes++; // a second fixture in the week would add; none expected GW6-15
    p.xp[w] += +r.expected_fpl_points;
    p.app[w] = Math.min(1, (+r.start_probability || 0) + (+r.sub_appearance_probability || 0));
    p.start[w] = +r.start_probability || 0;
    p.mins[w] = +r.expected_minutes || 0;
    p.opp[w] = `${r.is_home ? 'H' : 'A'} ${r.opponent_team_name}`;
    p.total += +r.expected_fpl_points;
  }
  const all = [...players.values()];
  const lowEvidence = all.filter(isLowEvidence);
  console.log(`${rows.length} rows, ${all.length} players, ${dupes} second fixtures, ${lowEvidence.length} low-evidence`);

  const byName = (n: string) => { const p = all.find((q) => q.name === n); if (!p) throw new Error(`No player ${n}`); return p; };
  const haaland = byName('Haaland');
  const named = ['Haaland', 'Saka', 'B.Fernandes', 'Palmer', 'Isak', 'Tavernier', 'Mbeumo'].map(byName);

  // ---- pairs: every possible second captaincy option for Haaland ----
  const partners = all
    .filter((p) => p.id !== haaland.id && p.total > 25)
    .map((p) => {
      const r = rotationGain(haaland, [p], weeks);
      return { id: p.id, name: p.name, team: p.team, pos: p.pos, price: p.price, own: p.own, xp10: +p.total.toFixed(2),
        gain: +r.gain.toFixed(2), weeks_captain: r.path.filter((x) => x.captain === p.name).length,
        low_evidence: isLowEvidence(p) };
    })
    .sort((a, b) => b.gain - a.gain);

  const combos: Record<string, string[]> = {
    'Haaland alone': ['Haaland'],
    'Haaland + Saka': ['Haaland', 'Saka'],
    'Haaland + Bruno': ['Haaland', 'B.Fernandes'],
    'Haaland + Palmer': ['Haaland', 'Palmer'],
    'Haaland + Saka + Bruno': ['Haaland', 'Saka', 'B.Fernandes'],
    'Haaland + Saka + Palmer': ['Haaland', 'Saka', 'Palmer'],
    'Saka + Bruno (no Haaland)': ['Saka', 'B.Fernandes'],
  };
  const combosOut = Object.entries(combos).map(([label, names]) => {
    const ps = names.map(byName);
    const path = captainPath(ps, weeks);
    const total = path.reduce((t, x) => t + x.points, 0);
    return { label, players: names, cost: +ps.reduce((t, p) => t + p.price, 0).toFixed(1),
      captain_points: +total.toFixed(2), gain_vs_haaland: +(total - rotationGain(haaland, [], weeks).base).toFixed(2),
      armbands: Object.fromEntries(names.map((n) => [n, path.filter((x) => x.captain === n).length])),
      path: path.map((x) => ({ gw: x.gw, captain: x.captain, points: +x.points.toFixed(2) })) };
  });

  // ---- squads ----
  const premiums = all.filter((p) => p.price >= 9.0 && p.id !== haaland.id).map((p) => p.id);
  const scenarios: { key: string; label: string; include: number[]; exclude: number[] }[] = [
    { key: 'free', label: 'Optimiser chooses', include: [], exclude: [] },
    { key: 'haaland_alone', label: 'Haaland, no other £9m+ player', include: [haaland.id], exclude: premiums },
    { key: 'haaland_saka', label: 'Haaland + Saka', include: [haaland.id, byName('Saka').id], exclude: [] },
    { key: 'haaland_bruno', label: 'Haaland + Bruno', include: [haaland.id, byName('B.Fernandes').id], exclude: [] },
    { key: 'haaland_palmer', label: 'Haaland + Palmer', include: [haaland.id, byName('Palmer').id], exclude: [] },
    { key: 'haaland_saka_bruno', label: 'Haaland + Saka + Bruno', include: [haaland.id, byName('Saka').id, byName('B.Fernandes').id], exclude: [] },
    { key: 'no_haaland', label: 'No Haaland', include: [], exclude: [haaland.id] },
  ];
  const lowIds = lowEvidence.map((p) => p.id);
  const solve = (include: number[], exclude: number[], budget: number) => {
    const t0 = Date.now();
    const lp = buildLp(all, weeks, budget, new Set(include), new Set(exclude));
    const res: any = highs.solve(lp, { time_limit: 240, mip_rel_gap: 1e-6 } as any);
    const ids = new Set(all.filter((_p, i) => Math.round(res.Columns[`x_${i}`]?.Primal ?? 0) === 1).map((p) => p.id));
    const squad = all.filter((p) => ids.has(p.id));
    if (squad.length !== 15) throw new Error(`Solve gave ${squad.length} players (${res.Status})`);
    const bad = Object.values(squad.reduce((m: Record<number, number>, p) => ({ ...m, [p.teamId]: (m[p.teamId] ?? 0) + 1 }), {})).some((n) => n > 3);
    if (bad) throw new Error('Club limit violated');
    return { status: res.Status, objective: +(res.ObjectiveValue ?? 0).toFixed(2), seconds: +((Date.now() - t0) / 1000).toFixed(1), ...describeSquad(squad, weeks) };
  };
  const squads: any[] = [];
  for (const sc of scenarios) {
    for (const variant of ['published', 'evidence'] as const) {
      const exclude = variant === 'evidence' ? [...sc.exclude, ...lowIds.filter((id) => !sc.include.includes(id))] : sc.exclude;
      const r = solve(sc.include, exclude, 100);
      console.log(`${sc.key}/${variant}: ${r.total} (${r.status}, ${r.seconds}s)`);
      squads.push({ key: sc.key, label: sc.label, variant, ...r });
    }
  }
  const budgetCurve: any[] = [];
  for (const b of [95, 97.5, 100, 102.5, 105]) {
    const r = solve([], lowIds, b);
    console.log(`budget ${b}: ${r.total}`);
    budgetCurve.push({ budget: b, total: r.total, captain_points: r.captain_points, cost: r.cost, status: r.status });
  }

  const result = {
    from, to, weeks, generated_at: new Date().toISOString(),
    projection_snapshot: (snap as any)?.max_generated_at ?? null, model_version: 'leaguewide_v6', scenario_key: 'baseline',
    rows: rows.length, players: all.length, second_fixtures: dupes,
    low_evidence: lowEvidence.map((p) => ({ id: p.id, name: p.name, team: p.team, price: p.price, minutes: p.seasonMinutes,
      start: +(weeks.reduce((t, w) => t + p.start[w], 0) / weeks.length).toFixed(2), xp10: +p.total.toFixed(2) })),
    named: named.map((p) => ({ id: p.id, name: p.name, team: p.team, pos: p.pos, price: p.price, own: p.own, xp10: +p.total.toFixed(2),
      minutes: p.seasonMinutes, gw: weeks.map((w) => ({ gw: w, xp: +p.xp[w].toFixed(2), app: +p.app[w].toFixed(3), start: +p.start[w].toFixed(3),
        mins: +p.mins[w].toFixed(1), opp: p.opp[w] })) })),
    partners: partners.slice(0, 40),
    partner_correlation: correlation(partners.map((p) => p.xp10), partners.map((p) => p.gain)),
    combos: combosOut, squads, budget_curve: budgetCurve,
  };
  const { error: insErr } = await sb.from('analysis_results').insert({ analysis_id: 'captain_partnerships', code_ref: process.env.GITHUB_SHA ?? 'local', result });
  if (insErr) throw insErr;
  console.log('Saved analysis_results captain_partnerships');
}

function correlation(a: number[], b: number[]) {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return +(num / Math.sqrt(da * db)).toFixed(3);
}

if (process.argv[1]?.endsWith('analysis_captain_partnerships.ts')) {
  main().catch((e) => { console.error('analysis_captain_partnerships failed:', e); process.exit(1); });
}
