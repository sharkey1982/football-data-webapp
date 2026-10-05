// ============================================================================
// src/lib/fanteam/optimiser.ts
//
// One-gameweek FanTeam Classic 11 lineup optimiser (weekly contests).
//
//   maximise  Σ v_i x_i  +  Σ k_i c_i  −  Σ_club z_club  −  ε Σ price_i x_i
//   s.t.      Σ price_i x_i ≤ budget
//             Σ x_i = 11; xi_min[pos] ≤ Σ_{i∈pos} x_i ≤ xi_max[pos]
//             Σ_{i∈club} x_i ≤ max_per_club
//             Σ c_i = 1, c_i ≤ x_i                      (captain)
//             z_club ≥ q_club (D_club − 1), z_club ≥ q_club (2 D_club − 3), z ≥ 0
//               D_club = GK+DEF picked from the club    (stacking penalty)
//
// v_i is the player's expected points (with the safety net when the contest
// has one), k_i the captain's extra (his expected points if he starts, times
// P(start); the vice covers the rest, chosen after the solve). The stacking
// penalty steps 0, −1, −2, −3 for the 1st..4th defensive player with a clean
// sheet are convex in the count, so max(0, D−1, 2D−3) is exact for D ≤ 3.
// q_club = P(clean sheet) for that club's defence. ε prefers the cheaper of
// two equal lineups (FanTeam's tie-break is most budget left).
//
// Every result is re-checked by validateLineup(), independently of the
// solver, before it is shown.
// ============================================================================

import type { Pos } from './scoring';

export type Candidate = {
  key: string;            // stable id (FanTeam row key)
  name: string;
  team_id: number;
  team_name: string;
  pos: Pos;
  price: number;          // £m
  value: number;          // expected points used by the solver
  captainExtra: number;   // expected extra points if captained
  s: number;              // P(start)
  ifStart: number;        // expected points given he starts
  pCleanSheet: number;    // P(clean sheet, 60+) for stacking
};

export type ContestRules = {
  budget: number;
  size: number;
  xiMin: Record<Pos, number>;
  xiMax: Record<Pos, number>;
  maxPerClub: number;
  captainMultiplier: number;
  stacking: boolean;
};

export type Lineup = {
  players: Candidate[];
  captain: Candidate;
  vice: Candidate;
  cost: number;
  left: number;
  expectedPoints: number;   // incl. captain/vice and stacking penalty
  stackingPenalty: number;
};

export type SolverFn = (lp: string) => { Status: string; Columns: Record<string, { Primal: number }> };

const EPS_PRICE = 1e-4;
const fmt = (v: number) => (Math.round(v * 1e6) / 1e6).toString();

function sum(terms: string[]): string {
  return terms.length ? terms.join(' + ') : '0';
}

function term(coef: number, v: string): string {
  return coef < 0 ? `- ${fmt(-coef)} ${v}` : `+ ${fmt(coef)} ${v}`;
}

/** Stacking clean-sheet probability for a club: the average over its
 * defensive candidates who are likely starters. */
export function clubCleanSheet(pool: Candidate[]): Map<number, number> {
  const out = new Map<number, number>();
  const byClub = new Map<number, Candidate[]>();
  for (const c of pool) {
    if (c.pos !== 'GK' && c.pos !== 'DEF') continue;
    if (!byClub.has(c.team_id)) byClub.set(c.team_id, []);
    byClub.get(c.team_id)!.push(c);
  }
  for (const [club, list] of byClub) {
    const starters = list.filter((c) => c.s >= 0.5);
    const use = starters.length ? starters : list;
    out.set(club, use.reduce((a, c) => a + c.pCleanSheet, 0) / use.length);
  }
  return out;
}

export function buildLp(pool: Candidate[], rules: ContestRules, cuts: string[][] = [], locked: string[] = []): string {
  const obj: string[] = [];
  const cons: string[] = [];
  const bin: string[] = [];
  const x = (i: number) => `x${i}`, c = (i: number) => `c${i}`;

  pool.forEach((p, i) => {
    bin.push(x(i), c(i));
    obj.push(term(p.value - EPS_PRICE * p.price, x(i)));
    obj.push(term(p.captainExtra, c(i)));
    cons.push(`cap_link${i}: ${c(i)} - ${x(i)} <= 0`);
  });
  cons.push(`size: ${sum(pool.map((_, i) => x(i)))} = ${rules.size}`);
  cons.push(`budget: ${sum(pool.map((p, i) => `${fmt(p.price)} ${x(i)}`))} <= ${fmt(rules.budget)}`);
  cons.push(`captain: ${sum(pool.map((_, i) => c(i)))} = 1`);
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Pos[]) {
    const t = pool.map((p, i) => (p.pos === pos ? x(i) : null)).filter(Boolean) as string[];
    if (!t.length) continue;
    cons.push(`min_${pos}: ${sum(t)} >= ${rules.xiMin[pos]}`);
    cons.push(`max_${pos}: ${sum(t)} <= ${rules.xiMax[pos]}`);
  }
  const clubs = [...new Set(pool.map((p) => p.team_id))];
  for (const club of clubs) {
    const t = pool.map((p, i) => (p.team_id === club ? x(i) : null)).filter(Boolean) as string[];
    if (t.length > rules.maxPerClub) cons.push(`club_${club}: ${sum(t)} <= ${rules.maxPerClub}`);
  }
  if (rules.stacking) {
    const q = clubCleanSheet(pool);
    for (const club of clubs) {
      const d = pool.map((p, i) => (p.team_id === club && (p.pos === 'GK' || p.pos === 'DEF') ? i : -1)).filter((i) => i >= 0);
      const qc = q.get(club) ?? 0;
      if (d.length < 2 || qc <= 0) continue;
      const z = `z${club}`;
      obj.push(term(-1, z));
      // z >= q (D - 1)  ->  z - q D >= -q
      cons.push(`stack1_${club}: ${z} ${d.map((i) => term(-qc, x(i))).join(' ')} >= ${fmt(-qc)}`);
      // z >= q (2D - 3) -> z - 2q D >= -3q
      cons.push(`stack2_${club}: ${z} ${d.map((i) => term(-2 * qc, x(i))).join(' ')} >= ${fmt(-3 * qc)}`);
    }
  }
  // Must-include players.
  locked.forEach((key) => {
    const i = pool.findIndex((p) => p.key === key);
    if (i >= 0) cons.push(`lock${i}: ${x(i)} = 1`);
  });
  // No-good cuts: exclude previously found lineups (for alternatives).
  cuts.forEach((keys, k) => {
    const idx = keys.map((key) => pool.findIndex((p) => p.key === key)).filter((i) => i >= 0);
    if (idx.length) cons.push(`cut${k}: ${sum(idx.map(x))} <= ${idx.length - 1}`);
  });
  const objStr = obj.join(' ').replace(/^\+ /, '');
  // z variables default to lower bound 0 in LP format.
  return `Maximize\n obj: ${objStr}\nSubject To\n ${cons.join('\n ')}\nBinary\n ${bin.join('\n ')}\nEnd\n`;
}

export function chooseVice(players: Candidate[], captain: Candidate): Candidate {
  return players
    .filter((p) => p.key !== captain.key)
    .reduce((best, p) => (p.s * p.ifStart > best.s * best.ifStart ? p : best),
      players.find((p) => p.key !== captain.key)!);
}

/** Stacking penalty in expected points for a picked lineup. */
export function stackingPenalty(players: Candidate[], pool: Candidate[]): number {
  const q = clubCleanSheet(pool);
  const counts = new Map<number, number>();
  for (const p of players) if (p.pos === 'GK' || p.pos === 'DEF') counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1);
  let pen = 0;
  for (const [club, d] of counts) pen += (q.get(club) ?? 0) * Math.max(0, d - 1, 2 * d - 3);
  return pen;
}

export function lineupPoints(players: Candidate[], captain: Candidate, vice: Candidate, rules: ContestRules, pool: Candidate[]) {
  const base = players.reduce((a, p) => a + p.value, 0);
  const mult = rules.captainMultiplier - 1;
  const capExtra = mult * captain.s * captain.ifStart;
  const viceExtra = mult * (1 - captain.s) * vice.s * vice.ifStart;
  const pen = rules.stacking ? stackingPenalty(players, pool) : 0;
  return { total: base + capExtra + viceExtra - pen, penalty: pen };
}

export function solveLineup(pool: Candidate[], rules: ContestRules, solve: SolverFn, cuts: string[][] = [], locked: string[] = []): Lineup {
  const result = solve(buildLp(pool, rules, cuts, locked));
  if (result.Status === 'Infeasible') throw new Error('No valid lineup: the must-include players, budget or club limit can\'t all be met');
  if (result.Status !== 'Optimal') throw new Error(`Solver status: ${result.Status}`);
  const players = pool.filter((_, i) => Math.round(result.Columns[`x${i}`]?.Primal ?? 0) === 1);
  const captain = pool.find((_, i) => Math.round(result.Columns[`c${i}`]?.Primal ?? 0) === 1);
  if (!captain) throw new Error('Solver returned no captain');
  const vice = chooseVice(players, captain);
  const cost = Math.round(players.reduce((a, p) => a + p.price, 0) * 10) / 10;
  const { total, penalty } = lineupPoints(players, captain, vice, rules, pool);
  const lineup: Lineup = {
    players, captain, vice, cost, left: Math.round((rules.budget - cost) * 10) / 10,
    expectedPoints: total, stackingPenalty: penalty,
  };
  const problems = validateLineup(lineup, rules);
  if (problems.length) throw new Error(`Lineup failed the rule check: ${problems.join('; ')}`);
  return lineup;
}

/** Independent rule check; returns the list of violations (empty = valid). */
export function validateLineup(l: Lineup, rules: ContestRules): string[] {
  const out: string[] = [];
  const keys = new Set(l.players.map((p) => p.key));
  if (keys.size !== l.players.length) out.push('duplicate player');
  if (l.players.length !== rules.size) out.push(`${l.players.length} players, need ${rules.size}`);
  const cost = l.players.reduce((a, p) => a + p.price, 0);
  if (cost > rules.budget + 1e-6) out.push(`cost £${cost.toFixed(1)}m over budget £${rules.budget}m`);
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Pos[]) {
    const n = l.players.filter((p) => p.pos === pos).length;
    if (n < rules.xiMin[pos] || n > rules.xiMax[pos]) out.push(`${n} ${pos}, allowed ${rules.xiMin[pos]}–${rules.xiMax[pos]}`);
  }
  const perClub = new Map<number, number>();
  for (const p of l.players) perClub.set(p.team_id, (perClub.get(p.team_id) ?? 0) + 1);
  for (const [club, n] of perClub) if (n > rules.maxPerClub) {
    const name = l.players.find((p) => p.team_id === club)?.team_name ?? String(club);
    out.push(`${n} players from ${name}, max ${rules.maxPerClub}`);
  }
  if (!keys.has(l.captain.key)) out.push('captain not in lineup');
  if (!keys.has(l.vice.key) || l.vice.key === l.captain.key) out.push('vice-captain invalid');
  return out;
}
