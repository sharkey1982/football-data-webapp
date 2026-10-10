// ============================================================================
// Shark Fantasy: bot managers (design §4.4). They play the game through the
// same rules a person does, from the public view only (the projection and
// what has happened), to test whether skill beats luck:
//
//   optimiser    HiGHS: the best squad, XI and captain for the projection
//                over a short horizon, transfers when they pay for themselves
//                (hits included), the Wildcard when it's worth 10+ points;
//   template     a typical human: premiums first, then fill; one transfer a
//                week out of the weakest player; captain the top projection;
//   setforget    the optimiser's squad on day one, then never touched again
//                (the once-a-week player who forgets);
//   chaser       picks like the template, then chases last weeks' points;
//   random       any valid squad, any valid XI, a random transfer now and then.
//
// Each bot (but random) has its own small opinion on each player (seeded
// noise, sd 0.35 points a round), and each optimiser its own horizon, so
// bots of a kind don't all pick the same team.
// ============================================================================
import type { Position } from '../engine/types';
import type { Rng } from '../engine/rng';
import { stream } from '../engine/rng';
import { GAME_RULES_V1 } from './rules';
import type { GameRules } from './rules';
import type { Entry, PlayerInfo, Selection } from './squad';
import { squadProblems, lineupProblems } from './squad';
import { applyTransfers, sellingPrice } from './market';

export type BotKind = 'optimiser' | 'template' | 'setforget' | 'chaser' | 'random';
export const BOT_KINDS: BotKind[] = ['optimiser', 'template', 'setforget', 'chaser', 'random'];

export type Solver = (lp: string) => { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }> };

export interface Bot {
  id: string;
  kind: BotKind;
  entry: Entry;
  /** Re-seeded each round from seedKey, so a bot run round by round from the
   *  database (a fresh process each week) moves exactly as it does in memory. */
  rng: Rng;
  seedKey: string;
  /** optimiser: rounds looked ahead, and its opinion on each player (points a round). */
  horizon: number;
  opinion: Record<string, number>;
}

/** What a bot sees before a deadline. */
export interface BotContext {
  round: number;
  players: PlayerInfo[];
  info: (id: string) => PlayerInfo;
  price: (id: string) => number;
  /** Public projection: expected points per player for each round (index round − 1; 0 when unknown). */
  xp: Record<string, number[]>;
  /** Points per player in rounds already played (index round − 1). */
  points: Record<string, number[]>;
  solve: Solver;
  rules?: GameRules;
}

const POS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const fmt = (v: number) => (Math.round(v * 1e5) / 1e5).toString();
const term = (c: number, v: string) => (c < 0 ? `- ${fmt(-c)} ${v}` : `+ ${fmt(c)} ${v}`);

export function newBot(id: string, kind: BotKind, seed: string, players: PlayerInfo[]): Bot {
  const rng = stream(`${seed}|bot|${id}`);
  const opinion: Record<string, number> = {};
  for (const p of players) opinion[p.id] = kind === 'random' ? 0 : rng.normal(0, 0.35);
  return { id, kind, rng, seedKey: `${seed}|bot|${id}`, horizon: kind === 'optimiser' ? 2 + rng.int(0, 2) : 4, opinion,
    entry: { id, picks: [], selection: { xi: [], bench: [], captain: '', vice: '' }, bank: 0, freeTransfers: 1, wildcardsLeft: 1, transfersThisRound: 0, wildcardThisRound: false, pointsByRound: [], hitsByRound: [] } };
}

// ---------------------------------------------------------------------------
// The optimiser's model: one mixed-integer program for squad, XI and captain.
// ---------------------------------------------------------------------------
interface SquadSolve { picks: string[]; xi: string[]; captain: string; objective: number }

/** Best squad for `now` (this round's points) and `later` (the following
 *  rounds), given the current squad (sold at selling prices) and money.
 *  `free` = free transfers (Infinity: unlimited, as before round 1 or on a Wildcard). */
export function solveSquad(ctx: BotContext, now: Record<string, number>, later: Record<string, number>, current: { picks: { playerId: string; purchasePrice: number }[]; bank: number } | null, free: number, opts: { churn?: number; maxTransfers?: number } = {}): SquadSolve | null {
  const rules = ctx.rules ?? GAME_RULES_V1;
  const owned = new Map((current?.picks ?? []).map(p => [p.playerId, p.purchasePrice]));
  const cost = (id: string) => (owned.has(id) ? sellingPrice(owned.get(id)!, ctx.price(id)) : ctx.price(id));
  const money = current ? current.bank + [...owned.keys()].reduce((a, id) => a + cost(id), 0) : rules.budget;
  const ps = ctx.players;
  const obj: string[] = [], cons: string[] = [], bin: string[] = [];
  ps.forEach((p, i) => {
    bin.push(`p${i}`, `s${i}`, `c${i}`);
    const n = now[p.id] ?? 0, l = later[p.id] ?? 0;
    obj.push(term(0.1 * n + l, `p${i}`), term(n, `s${i}`), term(n * (rules.captainMultiplier - 1), `c${i}`));
    cons.push(`ls${i}: s${i} - p${i} <= 0`, `lc${i}: c${i} - s${i} <= 0`);
  });
  for (const pos of POS) {
    const idx = ps.map((p, i) => (p.position === pos ? i : -1)).filter(i => i >= 0);
    cons.push(`sq_${pos}: ${idx.map(i => `+ p${i}`).join(' ')} = ${rules.squad[pos]}`);
    cons.push(`xmin_${pos}: ${idx.map(i => `+ s${i}`).join(' ')} >= ${rules.xiMin[pos]}`);
    cons.push(`xmax_${pos}: ${idx.map(i => `+ s${i}`).join(' ')} <= ${rules.xiMax[pos]}`);
  }
  cons.push(`xi: ${ps.map((_, i) => `+ s${i}`).join(' ')} = 11`);
  cons.push(`cap: ${ps.map((_, i) => `+ c${i}`).join(' ')} = 1`);
  cons.push(`budget: ${ps.map((p, i) => `+ ${cost(p.id)} p${i}`).join(' ')} <= ${money}`);
  for (const club of new Set(ps.map(p => p.clubId))) cons.push(`club_${club.replace(/\W/g, '_')}: ${ps.map((p, i) => (p.clubId === club ? `+ p${i}` : '')).filter(Boolean).join(' ')} <= ${rules.maxPerClub}`);
  if (current && Number.isFinite(free)) {
    const newIdx = ps.map((p, i) => (owned.has(p.id) ? -1 : i)).filter(i => i >= 0);
    // transfers n = new players picked; hits h >= n − free
    cons.push(`hit: h ${newIdx.map(i => `- p${i}`).join(' ')} >= ${-free}`);
    cons.push(`maxt: ${newIdx.map(i => `+ p${i}`).join(' ')} <= ${opts.maxTransfers ?? free + 2}`);
    obj.push(term(-rules.hit, 'h'));
    if (opts.churn) newIdx.forEach(i => obj.push(term(-opts.churn!, `p${i}`)));
  } else if (current && opts.churn) {
    ps.forEach((p, i) => { if (!owned.has(p.id)) obj.push(term(-opts.churn!, `p${i}`)); });
  }
  const lp = `Maximize\n obj: ${obj.join(' ').replace(/^\+ /, '')}\nSubject To\n ${cons.join('\n ')}\nBounds\n h >= 0\nBinary\n ${bin.join('\n ')}\nEnd\n`;
  const r = ctx.solve(lp);
  if (r.Status !== 'Optimal') return null;
  const on = (v: string) => Math.round(r.Columns[v]?.Primal ?? 0) === 1;
  const picks = ps.filter((_, i) => on(`p${i}`)).map(p => p.id);
  const xi = ps.filter((_, i) => on(`s${i}`)).map(p => p.id);
  const captain = ps.find((_, i) => on(`c${i}`))!.id;
  return { picks, xi, captain, objective: r.ObjectiveValue };
}

/** Bench order (reserve keeper first, then by score) and the vice-captain. */
export function selectionFor(squad: string[], xi: string[], captain: string, score: (id: string) => number, info: (id: string) => PlayerInfo): Selection {
  const bench = squad.filter(id => !xi.includes(id));
  bench.sort((a, b) => (info(a).position === 'GK' ? -1 : 0) - (info(b).position === 'GK' ? -1 : 0) || score(b) - score(a));
  const vice = xi.filter(id => id !== captain).sort((a, b) => score(b) - score(a))[0];
  return { xi, bench, captain, vice };
}

/** Greedy best XI for a score: the formation minimums, then the best of the rest within the maximums. */
export function bestXI(squad: string[], score: (id: string) => number, info: (id: string) => PlayerInfo, rules: GameRules = GAME_RULES_V1): Selection {
  const sorted = squad.slice().sort((a, b) => score(b) - score(a));
  const xi: string[] = [];
  const n = (pos: Position) => xi.filter(id => info(id).position === pos).length;
  for (const pos of POS) for (const id of sorted) if (info(id).position === pos && n(pos) < rules.xiMin[pos]) xi.push(id);
  for (const id of sorted) if (xi.length < 11 && !xi.includes(id) && n(info(id).position) < rules.xiMax[info(id).position]) xi.push(id);
  const captain = xi.slice().sort((a, b) => score(b) - score(a))[0];
  return selectionFor(squad, xi, captain, score, info);
}

// ---------------------------------------------------------------------------
// Heuristic squads.
// ---------------------------------------------------------------------------
/** Fill a squad in order of `rank`, keeping enough money for the cheapest fill of the remaining places. */
function greedySquad(ctx: BotContext, order: string[], keep: string[] = [], money: number = (ctx.rules ?? GAME_RULES_V1).budget): string[] | null {
  const rules = ctx.rules ?? GAME_RULES_V1;
  const squad = keep.slice();
  const need = (pos: Position) => rules.squad[pos] - squad.filter(id => ctx.info(id).position === pos).length;
  const club = (c: string) => squad.filter(id => ctx.info(id).clubId === c).length;
  const cheapest: Record<Position, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of ctx.players) cheapest[p.position].push(ctx.price(p.id));
  for (const pos of POS) cheapest[pos].sort((a, b) => a - b);
  const reserve = (except: Position) => POS.reduce((s, pos) => s + cheapest[pos].slice(0, Math.max(0, need(pos) - (pos === except ? 1 : 0))).reduce((a, b) => a + b, 0), 0);
  let spent = squad.reduce((a, id) => a + ctx.price(id), 0);
  for (const id of order) {
    const p = ctx.info(id);
    if (squad.includes(id) || need(p.position) <= 0 || club(p.clubId) >= rules.maxPerClub) continue;
    if (spent + ctx.price(id) + reserve(p.position) > money) continue;
    squad.push(id); spent += ctx.price(id);
  }
  return squad.length === 15 ? squad : null;
}

function randomSquad(ctx: BotContext, rng: Rng): string[] {
  for (let tries = 0; tries < 200; tries++) {
    const order = rng.shuffle(ctx.players.map(p => p.id));
    const sq = greedySquad(ctx, order);
    if (sq) return sq;
  }
  throw new Error('no random squad');
}

function randomSelection(squad: string[], ctx: BotContext, rng: Rng): Selection {
  const rules = ctx.rules ?? GAME_RULES_V1;
  for (;;) {
    const shapes: Record<Position, number>[] = [];
    for (let d = rules.xiMin.DEF; d <= rules.xiMax.DEF; d++) for (let m = rules.xiMin.MID; m <= rules.xiMax.MID; m++) {
      const f = 10 - d - m;
      if (f >= rules.xiMin.FWD && f <= rules.xiMax.FWD) shapes.push({ GK: 1, DEF: d, MID: m, FWD: f });
    }
    const shape = rng.pick(shapes);
    if (POS.some(pos => shape[pos] > rules.squad[pos])) continue;
    const xi: string[] = [];
    for (const pos of POS) xi.push(...rng.shuffle(squad.filter(id => ctx.info(id).position === pos)).slice(0, shape[pos]));
    const captain = rng.pick(xi);
    return selectionFor(squad, xi, captain, () => rng.next(), ctx.info);
  }
}

// ---------------------------------------------------------------------------
// Decisions.
// ---------------------------------------------------------------------------
const sumRounds = (xp: number[], from: number, n: number, decay = 0.85) => {
  let s = 0;
  for (let k = 0; k < n; k++) s += (xp[from - 1 + k] ?? 0) * decay ** k;
  return s;
};
const recent = (pts: number[], round: number, k = 3) => pts.slice(Math.max(0, round - 1 - k), round - 1).reduce((a, b) => a + b, 0);

function optimiserViews(bot: Bot, ctx: BotContext) {
  const now: Record<string, number> = {}, later: Record<string, number> = {};
  for (const p of ctx.players) {
    const xp = ctx.xp[p.id], bias = bot.opinion[p.id];
    now[p.id] = (xp[ctx.round - 1] ?? 0) + (xp[ctx.round - 1] ? bias : 0);
    later[p.id] = sumRounds(xp, ctx.round + 1, bot.horizon - 1) * 1 + (bot.horizon > 1 ? bias : 0);
  }
  return { now, later };
}

/** The squad a bot starts the season with (unlimited changes before round 1). */
export function initialSquad(bot: Bot, ctx: BotContext) {
  bot.rng = stream(`${bot.seedKey}|r${ctx.round}`);
  const rules = ctx.rules ?? GAME_RULES_V1;
  let squad: string[];
  let sel: Selection;
  if (bot.kind === 'optimiser' || bot.kind === 'setforget') {
    const { now, later } = bot.kind === 'optimiser' ? optimiserViews(bot, ctx)
      : { now: Object.fromEntries(ctx.players.map(p => [p.id, ctx.xp[p.id][0] + bot.opinion[p.id]])),
          later: Object.fromEntries(ctx.players.map(p => [p.id, sumRounds(ctx.xp[p.id], 2, 8, 0.95) + 5 * bot.opinion[p.id]])) };   // a squad for the whole season
    const s = solveSquad(ctx, now, later, null, Infinity)!;
    squad = s.picks;
    sel = selectionFor(squad, s.xi, s.captain, id => now[id], ctx.info);
  } else if (bot.kind === 'random') {
    squad = randomSquad(ctx, bot.rng);
    sel = randomSelection(squad, ctx, bot.rng);
  } else {
    // template and chaser: premiums by projection, filled with what's left
    const season = (id: string) => sumRounds(ctx.xp[id], 1, 9, 1) + 9 * bot.opinion[id];
    const order = ctx.players.map(p => p.id).sort((a, b) => season(b) - season(a));
    // keep a little back if the cheapest fills are at clubs already full
    let sq: string[] | null = null;
    for (let held = 0; !sq && held <= 100; held += 5) sq = greedySquad(ctx, order, [], rules.budget - held);
    squad = sq ?? randomSquad(ctx, bot.rng);
    sel = bestXI(squad, id => ctx.xp[id][0] + bot.opinion[id], ctx.info, rules);
  }
  const e = bot.entry;
  e.picks = squad.map(id => ({ playerId: id, purchasePrice: ctx.price(id) }));
  e.bank = rules.budget - squad.reduce((a, id) => a + ctx.price(id), 0);
  e.selection = sel;
  const problems = [...squadProblems(e.picks, ctx.info, ctx.price, rules, e.bank), ...lineupProblems(e.selection, e.picks, ctx.info, rules)];
  if (problems.length) throw new Error(`${bot.id}: ${problems.join('; ')}`);
}

/** A bot's moves before a deadline (round ≥ 2): transfers, XI, captain. */
export function weeklyMoves(bot: Bot, ctx: BotContext) {
  bot.rng = stream(`${bot.seedKey}|r${ctx.round}`);
  const rules = ctx.rules ?? GAME_RULES_V1, e = bot.entry, round = ctx.round;
  // sorted, so a squad read back from the database (in slot order) gives the same moves
  const squadIds = () => e.picks.map(p => p.playerId).sort();
  const xpNow = (id: string) => (ctx.xp[id][round - 1] ?? 0) + bot.opinion[id];
  const tryApply = (outs: string[], ins: string[]) => applyTransfers(e, outs, ins, ctx.price, ctx.info, rules).length === 0;

  if (bot.kind === 'setforget') return;

  if (bot.kind === 'optimiser') {
    const { now, later } = optimiserViews(bot, ctx);
    const cur = { picks: e.picks, bank: e.bank };
    let best = solveSquad(ctx, now, later, cur, e.freeTransfers, { churn: 0.5 });
    if (e.wildcardsLeft > 0 && round >= 2 && round <= 8) {
      const wc = solveSquad(ctx, now, later, cur, Infinity, { churn: 0.2 });
      if (wc && best && wc.objective > best.objective + 10) { e.wildcardThisRound = true; e.wildcardsLeft--; best = wc; }
    }
    if (!best) return;
    const outs = squadIds().filter(id => !best!.picks.includes(id)), ins = best.picks.filter(id => !squadIds().includes(id));
    if (!tryApply(outs, ins)) { if (e.wildcardThisRound) { e.wildcardThisRound = false; e.wildcardsLeft++; } }
    const sq = squadIds();
    e.selection = sq.length && best.picks.every(id => sq.includes(id))
      ? selectionFor(sq, best.xi, best.captain, id => now[id], ctx.info)
      : bestXI(sq, id => now[id], ctx.info, rules);
    return;
  }

  if (bot.kind === 'random') {
    if (bot.rng.chance(0.5)) {
      const out = bot.rng.pick(squadIds()), pos = ctx.info(out).position;
      for (const cand of bot.rng.shuffle(ctx.players.filter(p => p.position === pos && !squadIds().includes(p.id)).map(p => p.id)))
        if (tryApply([out], [cand])) break;
    }
    e.selection = randomSelection(squadIds(), ctx, bot.rng);
    return;
  }

  // template: weakest projection out, the best affordable projection in, when it gains 1+ point.
  // chaser: lowest recent points out, the highest recent points in.
  const value = bot.kind === 'template' ? xpNow : (id: string) => recent(ctx.points[id], round);
  const outs = squadIds().slice().sort((a, b) => value(a) - value(b));
  for (const out of outs.slice(0, 3)) {
    const pos = ctx.info(out).position;
    const ins = ctx.players.filter(p => p.position === pos && !squadIds().includes(p.id)).map(p => p.id).sort((a, b) => value(b) - value(a));
    let done = false;
    for (const cand of ins) {
      if (value(cand) - value(out) < (bot.kind === 'template' ? 1 : 2)) break;
      if (tryApply([out], [cand])) { done = true; break; }
    }
    if (done) break;
  }
  const pick = bot.kind === 'template' ? xpNow : (id: string) => recent(ctx.points[id], round) + 0.01 * xpNow(id);
  e.selection = bestXI(squadIds(), pick, ctx.info, rules);
}
