// ============================================================================
// src/lib/lastManStanding.ts
//
// Engine for /admin/last-man-standing: a Last Man Standing (SportSkins
// PremSkins / ChampSkins) pick optimiser. Pure functions, no I/O, so it can
// run in a Web Worker and in tests.
//
//   winProb        P(win) from expected goals (independent Poisson, as P5).
//   simulateField  The rest of the entrants, simulated as cohorts: how long
//                  the game runs and when the field reaches the "final X"
//                  prize line.
//   solve          Exact backward induction over every set of teams used
//                  (a bitmask), rewarding survival at the rounds where
//                  prize money is paid out.
//   analyse        Candidates for this round, the current best path, and the
//                  explanations shown on the page.
//
// Design: Claude Docs "Last Man Standing selector — audit and design"
// (6 Oct 2026). Rules: SportSkins game rules 5.1.13-5.1.15 (screenshots
// from Chris, 6 Oct): a share of the pot (default 20%) split between those
// left when the field first reaches the final 20/30/50/100 (by pot size);
// the rest to the last one standing; all out together = split.
// ============================================================================

export type Cell = {
  /** Chance this team wins its match this round. */
  p: number;
  opponent: string;
  home: boolean;
  fixtureId: number;
  kickoff: string | null;
  /** 'price' = de-vigged live odds; 'market' = market-rating goals; 'dc' = Dixon-Coles goals. */
  source: 'price' | 'market' | 'dc';
};

export type Problem = {
  teams: { id: number; name: string }[];
  /** Gameweek numbers, in order; rounds[0] is the round being picked. */
  rounds: number[];
  /** cells[r][t]: team t's fixture in rounds[r], or null (no valid fixture). */
  cells: (Cell | null)[][];
};

export type Prize = {
  /** Share of the pot split between the survivors when the field first reaches `line` or fewer. */
  sideShare: number;
  /** Survivors (including you) at which the side share is paid. */
  line: number;
  /** True once the line has already been reached: only the winner's share is left to play for. */
  linePassed: boolean;
};

export type FieldSettings = {
  /** Opponents still in (entrants left minus you). */
  opponents: number;
  /** How strongly the field favours the biggest favourite: picks ∝ exp(beta × win chance). */
  beta: number;
  sims: number;
  seed: number;
};

export type FieldCurve = {
  /** P(the game is still running at the start of round k). */
  running: number[];
  /** P(the last opponent goes out in round k). */
  extinct: number[];
  /** E[ 1{the field first reaches the line in round k} / (survivors including you) ]. */
  lineShare: number[];
  /** P(the line has been reached by the end of round k). */
  lineByRound: number[];
  /** Mean opponents left after round k (0 once the game is over). */
  meanLeft: number[];
  /** Share of the field picking each team in round 0 (model). */
  pickShare0: number[];
};

const GOALS = 13;
function poisson(lam: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lam);
  for (let g = 0; g < GOALS; g++) {
    out.push(p);
    p *= lam / (g + 1);
  }
  return out;
}

/** P(home win), P(draw), P(away win) from expected goals, independent Poisson over 0-12 goals. */
export function outcomeProbs(homeGoals: number, awayGoals: number): [number, number, number] {
  const ph = poisson(Math.max(homeGoals, 1e-6));
  const pa = poisson(Math.max(awayGoals, 1e-6));
  let h = 0, d = 0, a = 0;
  for (let i = 0; i < GOALS; i++) {
    for (let j = 0; j < GOALS; j++) {
      const v = ph[i] * pa[j];
      if (i > j) h += v; else if (i === j) d += v; else a += v;
    }
  }
  const s = h + d + a;
  return [h / s, d / s, a / s];
}

/** Seeded generator so the same inputs give the same page. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function binomial(n: number, p: number, rand: () => number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 60) {
    let c = 0;
    for (let i = 0; i < n; i++) if (rand() < p) c++;
    return c;
  }
  const v = Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal(rand));
  return Math.min(n, Math.max(0, v));
}

/** Multinomial draw by sequential binomials. */
function multinomial(n: number, probs: number[], rand: () => number): number[] {
  const out = new Array(probs.length).fill(0);
  let left = n;
  let mass = 1;
  for (let j = 0; j < probs.length && left > 0; j++) {
    if (probs[j] <= 0) continue;
    const q = mass > 0 ? Math.min(1, probs[j] / mass) : 1;
    const c = j === probs.length - 1 ? left : binomial(left, q, rand);
    out[j] = c;
    left -= c;
    mass -= probs[j];
  }
  if (left > 0) {
    // rounding left a few over: give them to the most picked team
    let jMax = 0;
    for (let j = 1; j < probs.length; j++) if (probs[j] > probs[jMax]) jMax = j;
    out[jMax] += left;
  }
  return out;
}

/**
 * The rest of the field, simulated as cohorts (counts per team, not per
 * entrant; checked against a per-entrant simulation on 2026/27 fixtures:
 * mean game length 11.8 v 11.4 rounds at 4,000, 9.1 v 9.0 at 500).
 * `usedShare0` (optional) = share of the field that has already used each
 * team; `pickShares0` (optional) replaces the model's round-0 pick shares.
 */
export function simulateField(problem: Problem, field: FieldSettings, prize: Prize, usedShare0?: number[], pickShares0?: number[]): FieldCurve {
  const R = problem.rounds.length;
  const T = problem.teams.length;
  const running = new Array(R).fill(0);
  const extinct = new Array(R).fill(0);
  const lineShare = new Array(R).fill(0);
  const lineHit = new Array(R).fill(0);
  const meanLeft = new Array(R).fill(0);
  const rand = rng(field.seed);
  let pickShare0: number[] = new Array(T).fill(0);

  for (let s = 0; s < field.sims; s++) {
    let n = field.opponents;
    let used = usedShare0 ? [...usedShare0] : new Array(T).fill(0);
    let crossed = prize.linePassed || n + 1 <= prize.line;
    if (n === 0) {
      // nobody left to beat: the game is over before it starts
      break;
    }
    for (let k = 0; k < R; k++) {
      running[k] += 1;
      const cells = problem.cells[k];
      let probs = cells.map((c, j) => (c && c.p > 0 ? (1 - used[j]) * Math.exp(field.beta * c.p) : 0));
      if (k === 0 && pickShares0) probs = pickShares0.map((v, j) => (cells[j] ? v : 0));
      const tot = probs.reduce((a, b) => a + b, 0);
      if (tot <= 0) { extinct[k] += 1; break; }
      probs = probs.map((v) => v / tot);
      if (k === 0 && s === 0) pickShare0 = probs;
      const picks = multinomial(n, probs, rand);
      let S = 0;
      const surv = picks.map((c, j) => {
        const won = cells[j] ? rand() < cells[j]!.p : false;
        const v = won ? c : 0;
        S += v;
        return v;
      });
      if (S > 0) {
        used = used.map((u, j) => {
          const nonPick = Math.max(n - picks[j], 1);
          const uNon = Math.min(1, (u * n) / nonPick);
          return (uNon * (S - surv[j]) + surv[j]) / S;
        });
      }
      n = S;
      meanLeft[k] += n;
      if (!crossed && n + 1 <= prize.line) {
        lineShare[k] += 1 / (n + 1);
        lineHit[k] += 1;
        crossed = true;
      }
      if (n === 0) { extinct[k] += 1; break; }
    }
  }
  const sims = Math.max(field.sims, 1);
  let cum = 0;
  const lineByRound = lineHit.map((v) => (cum += v / sims));
  if (prize.linePassed || field.opponents + 1 <= prize.line) lineByRound.fill(1);
  if (field.opponents === 0) {
    // already the last one standing
    return { running: running.map((_, k) => (k === 0 ? 1 : 0)), extinct: extinct.map((_, k) => (k === 0 ? 1 : 0)), lineShare, lineByRound, meanLeft, pickShare0 };
  }
  return {
    running: running.map((v) => v / sims),
    extinct: extinct.map((v) => v / sims),
    lineShare: lineShare.map((v) => v / sims),
    lineByRound,
    meanLeft: meanLeft.map((v) => v / sims),
    pickShare0,
  };
}

/** Per-round payoff for surviving the round given the game reached it, and the chance the game ends there. */
export function roundRewards(curve: FieldCurve, prize: Prize): { reward: number[]; ends: number[] } {
  const main = 1 - prize.sideShare;
  const reward = curve.running.map((run, k) => (run > 1e-12 ? (prize.sideShare * curve.lineShare[k] + main * curve.extinct[k]) / run : 0));
  const ends = curve.running.map((run, k) => (run > 1e-12 ? curve.extinct[k] / run : 1));
  return { reward, ends };
}

export type Solution = {
  /** V[mask] for masks reachable from the start: expected share of the pot. */
  V: Float32Array;
  usedMask: number;
  horizon: number;
  reward: number[];
  ends: number[];
};

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Exact DP over sets of teams used. V(m) = max over unused t of
 * p(r,t) × [reward_k + (1 − ends_k) × V(m ∪ t)], k = picks made since the start.
 * Rounds past the horizon (or where the game has effectively ended) are worth 0.
 */
export function solve(problem: Problem, usedMask: number, reward: number[], ends: number[]): Solution {
  const T = problem.teams.length;
  if (T > 24) throw new Error('At most 24 teams');
  const free: number[] = [];
  for (let t = 0; t < T; t++) if (!((usedMask >>> t) & 1)) free.push(t);
  const F = free.length;
  // stop once the game is all but certainly over
  let last = 0;
  for (let k = 0; k < reward.length; k++) if (reward[k] > 1e-9) last = k;
  const horizon = Math.min(problem.rounds.length, F, last + 1);
  const V = new Float32Array(2 ** T);
  const cells = problem.cells;

  for (let k = horizon - 1; k >= 0; k--) {
    const row = cells[k];
    const rw = reward[k];
    const go = 1 - ends[k];
    if (k === 0) {
      V[usedMask] = bestValue(usedMask, row, rw, go, V, free);
      break;
    }
    // every subset of the free teams with k members (Gosper's hack over F bits)
    let s = (1 << k) - 1;
    const limit = 1 << F;
    while (s < limit) {
      let m = usedMask;
      for (let i = 0, x = s; x; i++, x >>>= 1) if (x & 1) m |= 1 << free[i];
      V[m] = bestValue(m, row, rw, go, V, free);
      const c = s & -s;
      const r = s + c;
      s = (((r ^ s) >>> 2) / c) | r;
    }
  }
  return { V, usedMask, horizon, reward, ends };
}

function bestValue(m: number, row: (Cell | null)[], rw: number, go: number, V: Float32Array, free: number[]): number {
  let best = 0;
  for (let i = 0; i < free.length; i++) {
    const t = free[i];
    const bit = 1 << t;
    if (m & bit) continue;
    const c = row[t];
    if (!c || c.p <= 0) continue;
    const v = c.p * (rw + go * V[m | bit]);
    if (v > best) best = v;
  }
  return best;
}

/** Value of picking team t now, from state m at round k. */
export function pickValue(sol: Solution, problem: Problem, m: number, k: number, t: number): number {
  const c = problem.cells[k]?.[t];
  if (!c || c.p <= 0 || (m >>> t) & 1 || k >= sol.horizon) return 0;
  return c.p * (sol.reward[k] + (1 - sol.ends[k]) * (k + 1 < sol.horizon ? sol.V[m | (1 << t)] : 0));
}

export type PathStep = { round: number; team: number; cell: Cell; aliveAfter: number };

/** The current best path: the best pick each round if every pick wins. */
export function bestPath(sol: Solution, problem: Problem, maxSteps = 12): PathStep[] {
  const out: PathStep[] = [];
  let m = sol.usedMask;
  let alive = 1;
  for (let k = 0; k < Math.min(sol.horizon, maxSteps); k++) {
    let bt = -1, bv = 0;
    for (let t = 0; t < problem.teams.length; t++) {
      const v = pickValue(sol, problem, m, k, t);
      if (v > bv) { bv = v; bt = t; }
    }
    if (bt < 0) break;
    const cell = problem.cells[k][bt]!;
    alive *= cell.p;
    out.push({ round: problem.rounds[k], team: bt, cell, aliveAfter: alive });
    m |= 1 << bt;
  }
  return out;
}

export type Tag = 'Optimal' | 'Best survival' | 'Save' | 'Use now' | '';

export type Candidate = {
  team: number;
  name: string;
  cell: Cell;
  value: number;
  /** value ÷ the best value. */
  relative: number;
  /** Best fixture after this round, within the horizon. */
  bestLater: { round: number; p: number; opponent: string; home: boolean } | null;
  laterAbove65: number;
  tag: Tag;
  pickShare: number | null;
  /** E[average field left ÷ field left | this team wins]: above 1 when a win also knocks out more of the field. */
  leverage: number;
  /** value × leverage ÷ the best such value. */
  fieldRelative: number;
};

export type Analysis = {
  candidates: Candidate[];
  path: PathStep[];
  best: Candidate | null;
  why: string;
  /** Expected share of the pot from the best pick. */
  expected: number;
  /** Rounds (gameweek numbers) with fewer than three unused teams at 55%+. */
  bottlenecks: number[];
  /** Best pick once this round's field leverage is counted (needs pick shares). */
  fieldBest: Candidate | null;
};

/**
 * Field leverage for round 0. Your share of any prize scales roughly with
 * 1 ÷ the field left, so a pick that wins in the worlds where much of the
 * field goes out is worth more. Results are drawn jointly per match (a
 * draw knocks out both sides); the field survives in proportion to its pick
 * shares. Only this round's correlation is counted; later rounds use the
 * field-size curve. Returns a factor per team (1 = no leverage).
 */
export function leverage(problem: Problem, shares: number[], sims = 4000, seed = 11): number[] {
  const T = problem.teams.length;
  const row = problem.cells[0] ?? [];
  const fixtures = new Map<number, { home: number | null; away: number | null }>();
  row.forEach((c, t) => {
    if (!c) return;
    const f = fixtures.get(c.fixtureId) ?? { home: null, away: null };
    if (c.home) f.home = t; else f.away = t;
    fixtures.set(c.fixtureId, f);
  });
  const rand = rng(seed);
  const wins: Uint8Array[] = [];
  const surv = new Float64Array(sims);
  for (let i = 0; i < sims; i++) {
    const w = new Uint8Array(T);
    for (const f of fixtures.values()) {
      const u = rand();
      const ph = f.home != null ? row[f.home]!.p : 0;
      const pa = f.away != null ? row[f.away]!.p : 0;
      if (f.home != null && u < ph) w[f.home] = 1;
      else if (f.away != null && u >= ph && u < ph + pa) w[f.away] = 1;
    }
    let s = 0;
    for (let t = 0; t < T; t++) if (w[t]) s += shares[t] ?? 0;
    surv[i] = s;
    wins.push(w);
  }
  let mean = 0;
  for (let i = 0; i < sims; i++) mean += surv[i];
  mean /= sims;
  return Array.from({ length: T }, (_, t) => {
    let tot = 0, n = 0;
    for (let i = 0; i < sims; i++) {
      if (!wins[i][t]) continue;
      tot += mean / Math.max(surv[i], 1e-3);
      n++;
    }
    return n ? tot / n : 1;
  });
}

const pctText = (v: number) => `${Math.round(v * 100)}%`;
const ptsText = (v: number) => `${(v * 100).toFixed(1)} pts`;

export function analyse(sol: Solution, problem: Problem, pickShare: number[] | null): Analysis {
  const T = problem.teams.length;
  const m = sol.usedMask;
  const H = Math.max(sol.horizon, 1);
  const raw: Candidate[] = [];
  for (let t = 0; t < T; t++) {
    const cell = problem.cells[0]?.[t];
    if (!cell || (m >>> t) & 1) continue;
    let bestLater: Candidate['bestLater'] = null;
    let above = 0;
    for (let k = 1; k < H; k++) {
      const c = problem.cells[k]?.[t];
      if (!c) continue;
      if (c.p >= 0.65) above++;
      if (!bestLater || c.p > bestLater.p) bestLater = { round: problem.rounds[k], p: c.p, opponent: c.opponent, home: c.home };
    }
    raw.push({
      team: t, name: problem.teams[t].name, cell, value: pickValue(sol, problem, m, 0, t), relative: 0,
      bestLater, laterAbove65: above, tag: '', pickShare: pickShare ? pickShare[t] ?? null : null, leverage: 1, fieldRelative: 0,
    });
  }
  raw.sort((a, b) => b.value - a.value || b.cell.p - a.cell.p);
  const top = raw[0]?.value ?? 0;
  for (const c of raw) c.relative = top > 0 ? c.value / top : 0;
  let fieldBest: Candidate | null = null;
  if (pickShare) {
    const lev = leverage(problem, pickShare);
    for (const c of raw) c.leverage = lev[c.team];
    const fieldTop = Math.max(...raw.map((c) => c.value * c.leverage), 0);
    for (const c of raw) {
      c.fieldRelative = fieldTop > 0 ? (c.value * c.leverage) / fieldTop : 0;
      if (!fieldBest || c.fieldRelative > fieldBest.fieldRelative) fieldBest = c;
    }
  }
  const best = raw[0] ?? null;
  const fav = raw.reduce<Candidate | null>((a, c) => (!a || c.cell.p > a.cell.p ? c : a), null);
  for (const c of raw) {
    if (c === best) c.tag = 'Optimal';
    else if (c === fav) c.tag = 'Best survival';
    else if (best && c.cell.p > best.cell.p) c.tag = 'Save';
    else if (!c.bestLater || c.cell.p >= c.bestLater.p) c.tag = 'Use now';
  }
  let why = '';
  if (best) {
    const here = `${best.name} ${best.cell.home ? 'v' : 'at'} ${best.cell.opponent}, ${pctText(best.cell.p)}`;
    if (fav && fav !== best && fav.cell.p > best.cell.p) {
      const later = fav.bestLater;
      why = `${fav.name} are ${ptsText(fav.cell.p - best.cell.p)} more likely to win this week, ` +
        (later ? `but their GW${later.round} game ${later.home ? 'v' : 'at'} ${later.opponent} (${pctText(later.p)}) is worth more later: ` : 'but they are worth more later: ') +
        `using them now gives ${pctText(fav.relative)} of the best pick's value. Best: ${here}.`;
    } else if (!best.bestLater || best.cell.p >= best.bestLater.p) {
      why = `${here}. This is ${best.name}'s best fixture in the next ${H} rounds, so it's an efficient week to use them.`;
    } else {
      why = `${here}: the most likely winner this week, and keeping the others costs less than it gains.`;
    }
  }

  const bottlenecks: number[] = [];
  for (let k = 0; k < H; k++) {
    let n = 0;
    for (let t = 0; t < T; t++) {
      if ((m >>> t) & 1) continue;
      const c = problem.cells[k]?.[t];
      if (c && c.p >= 0.55) n++;
    }
    if (n < 3) bottlenecks.push(problem.rounds[k]);
  }

  return { candidates: raw, path: bestPath(sol, problem), best, why, expected: top, bottlenecks, fieldBest };
}

/** SportSkins rule 5.1.14: the side-prize line by total pot (£). */
export function lineForPot(pot: number | null): number {
  if (pot == null || pot <= 50000) return 20;
  if (pot <= 75000) return 30;
  if (pot <= 100000) return 50;
  return 100;
}

export type RunInput = {
  problem: Problem;
  usedMask: number;
  field: FieldSettings;
  prize: Prize;
  pickShares0?: number[];
};

export type RunOutput = {
  curve: FieldCurve;
  analysis: Analysis;
  horizon: number;
  ms: number;
};

/** Everything the page needs, in one call (run in a Worker). */
export function run(input: RunInput): RunOutput {
  const t0 = Date.now();
  const T = input.problem.teams.length;
  // what the rest of the field has already used is unknown: start it fresh
  const usedShare = new Array(T).fill(0);
  const curve = simulateField(input.problem, input.field, input.prize, usedShare, input.pickShares0);
  const { reward, ends } = roundRewards(curve, input.prize);
  const sol = solve(input.problem, input.usedMask, reward, ends);
  const analysis = analyse(sol, input.problem, input.pickShares0 ?? curve.pickShare0);
  return { curve, analysis, horizon: sol.horizon, ms: Date.now() - t0 };
}

export const _internal = { popcount, multinomial, binomial };

// ---------------------------------------------------------------------------
// Several entries (SportSkins allows 3). Each entry's expected prize is its
// own and the entries' values add up (two of yours in the final 20 both take
// a share), so each entry is solved on its own used teams against the same
// field. What spreading picks changes is the risk of losing every entry in
// one round: `spreads` sets the value given up against that risk.
// ---------------------------------------------------------------------------

export type Spread = {
  /** Team index per entry. */
  picks: number[];
  /** Sum of the entries' values ÷ the sum of each entry's best value. */
  relative: number;
  /** Chance every entry goes out this round. */
  allOut: number;
};

/** P(none of the picked sides wins). Picks in the same match are exclusive wins (both lose only on a draw). */
export function allOutChance(problem: Problem, picks: number[]): number {
  const byFixture = new Map<number, Set<number>>();
  for (const t of picks) {
    const c = problem.cells[0][t];
    if (!c) continue;
    const set = byFixture.get(c.fixtureId) ?? new Set<number>();
    set.add(t);
    byFixture.set(c.fixtureId, set);
  }
  let out = 1;
  for (const teams of byFixture.values()) {
    let win = 0;
    for (const t of teams) win += problem.cells[0][t]!.p;
    out *= Math.max(0, 1 - win);
  }
  return out;
}

export function spreads(problem: Problem, entries: Candidate[][], perEntry = 4, keep = 8): Spread[] {
  const tops = entries.map((cs) => cs.slice(0, perEntry));
  if (tops.some((t) => t.length === 0)) return [];
  const bestSum = tops.reduce((a, t) => a + t[0].value, 0);
  const out: Spread[] = [];
  const walk = (i: number, picks: Candidate[]) => {
    if (i === tops.length) {
      const v = picks.reduce((a, c) => a + c.value, 0);
      out.push({ picks: picks.map((c) => c.team), relative: bestSum > 0 ? v / bestSum : 0, allOut: allOutChance(problem, picks.map((c) => c.team)) });
      return;
    }
    for (const c of tops[i]) walk(i + 1, [...picks, c]);
  };
  walk(0, []);
  // drop orderings of the same multiset when entries share a used set
  const seen = new Set<string>();
  const uniq = out.filter((s) => {
    const key = [...s.picks].sort((a, b) => a - b).join(',') + '|' + s.picks.length;
    if (seen.has(key) && entries.every((e) => e === entries[0])) return false;
    seen.add(key);
    return true;
  });
  // keep the efficient ones: no other spread is both more valuable and safer
  const efficient = uniq.filter((s) => !uniq.some((o) => o !== s && o.relative >= s.relative && o.allOut <= s.allOut && (o.relative > s.relative || o.allOut < s.allOut)));
  return efficient.sort((a, b) => b.relative - a.relative).slice(0, keep);
}

export type EntriesInput = Omit<RunInput, 'usedMask'> & { usedMasks: number[] };
export type EntriesOutput = {
  curve: FieldCurve;
  entries: { analysis: Analysis; horizon: number }[];
  spreads: Spread[];
  ms: number;
};

export function runEntries(input: EntriesInput): EntriesOutput {
  const t0 = Date.now();
  const T = input.problem.teams.length;
  const curve = simulateField(input.problem, input.field, input.prize, new Array(T).fill(0), input.pickShares0);
  const { reward, ends } = roundRewards(curve, input.prize);
  const cache = new Map<number, { analysis: Analysis; horizon: number }>();
  const entries = input.usedMasks.map((m) => {
    let hit = cache.get(m);
    if (!hit) {
      const sol = solve(input.problem, m, reward, ends);
      hit = { analysis: analyse(sol, input.problem, input.pickShares0 ?? curve.pickShare0), horizon: sol.horizon };
      cache.set(m, hit);
    }
    return hit;
  });
  const sp = entries.length > 1 ? spreads(input.problem, entries.map((e) => e.analysis.candidates)) : [];
  return { curve, entries, spreads: sp, ms: Date.now() - t0 };
}
