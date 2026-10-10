// ============================================================================
// Shark Fantasy: a bot league over one season, round by round, exactly as the
// live game will run it (Phase 3b mirrors this in the database):
//
//   before the season: public view → projection → initial prices; squads;
//   each round: projection from the public view → bots make their moves →
//     deadline (hits, free transfers roll on) → the round is played → scores
//     (auto-subs, captain or vice) → prices move by form.
//
// Also records projected against actual points, for the projection check.
// ============================================================================
import { generateWorld } from '../engine/world';
import { startSeason, playRound } from '../engine/season';
import { GAME_RULES_V1 } from './rules';
import type { PlayerInfo } from './squad';
import { roundScore, lineupProblems, squadProblems } from './squad';
import { initialPrices, formPriceChange, closeTransferWindow } from './market';
import { publicView } from './publicview';
import { projectRounds } from './projection';
import type { Bot, BotKind, Solver, BotContext } from './bots';
import { newBot, initialSquad, weeklyMoves } from './bots';

export interface LeagueResult {
  seed: string;
  bots: { id: string; kind: BotKind; total: number; rank: number; byRound: number[]; hits: number; transfers: number; wildcardRound: number | null }[];
  /** One row per player per round: projected and actual. */
  projections: { round: number; xp: number; actual: number; pCS: number; cs: boolean; xGoals: number; goals: number; position: string }[];
  priceMoves: number;
}

export function runLeague(seed: string, lineup: Partial<Record<BotKind, number>>, solve: Solver): LeagueResult {
  const rules = GAME_RULES_V1;
  const world = generateWorld(seed);
  const ss = startSeason(world, 1);
  const infoMap = new Map<string, PlayerInfo>(world.players.map(p => [p.id, { id: p.id, clubId: p.clubId, position: p.position }]));
  const info = (id: string) => infoMap.get(id)!;
  const players = [...infoMap.values()];

  // prices from the pre-season projection (rounds 1–9)
  const xpTable = (fromRound: number) => {
    const pv = publicView(ss);
    const rounds = []; for (let r = fromRound; r <= 10; r++) rounds.push(r);
    const xp: Record<string, number[]> = {};
    for (const p of players) xp[p.id] = Array(10).fill(0);
    const rows = projectRounds(pv, rounds);
    for (const x of rows) xp[x.playerId][x.round - 1] = x.xPoints;
    return { xp, rows };
  };
  const pre = xpTable(1);
  const startPrice = initialPrices(players.map(p => ({ ...p, xp: pre.xp[p.id].reduce((a, b) => a + b, 0) })), rules);
  const priceNow = { ...startPrice };
  const expectedPerRound: Record<string, number> = {};
  for (const p of players) expectedPerRound[p.id] = pre.xp[p.id].slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  const price = (id: string) => priceNow[id];

  const bots: Bot[] = [];
  for (const [kind, n] of Object.entries(lineup) as [BotKind, number][]) for (let i = 0; i < n; i++) bots.push(newBot(`${kind}-${i + 1}`, kind, seed, players));
  const transfers: Record<string, number> = {}, wildcard: Record<string, number | null> = {};
  for (const b of bots) { transfers[b.id] = 0; wildcard[b.id] = null; }

  const projections: LeagueResult['projections'] = [];
  let priceMoves = 0;
  for (let round = 1; round <= 10; round++) {
    const { xp, rows } = round === 1 ? pre : xpTable(round);
    const ctx: BotContext = { round, players, info, price, xp, points: ss.points, solve, rules };
    for (const b of bots) {
      if (round === 1) initialSquad(b, ctx);
      else weeklyMoves(b, ctx);
      const problems = [...squadProblems(b.entry.picks, info, price, rules, b.entry.bank), ...lineupProblems(b.entry.selection, b.entry.picks, info, rules)];
      if (problems.length) throw new Error(`${b.id} round ${round}: ${problems.join('; ')}`);
      transfers[b.id] += b.entry.transfersThisRound;
      if (b.entry.wildcardThisRound) wildcard[b.id] = round;
    }
    const hits = bots.map(b => (round === 1 ? (b.entry.transfersThisRound = 0, 0) : closeTransferWindow(b.entry, rules)));
    const results = playRound(ss);

    const pts = (id: string) => ss.points[id][round - 1], mins = (id: string) => ss.minutes[id][round - 1];
    bots.forEach((b, i) => {
      const s = roundScore(b.entry.selection, pts, mins, info, rules);
      b.entry.pointsByRound.push(s.total);
      b.entry.hitsByRound.push(hits[i]);
    });

    // projection check: this round's projection against what happened
    const stat = new Map<string, { cs: boolean; goals: number }>();
    for (const r of results) for (const s of r.stats) stat.set(s.playerId, { cs: s.cleanSheet, goals: s.goals });
    for (const x of rows) if (x.round === round) {
      const st = stat.get(x.playerId);
      projections.push({ round, xp: x.xPoints, actual: pts(x.playerId), pCS: x.pCleanSheet, cs: st?.cs ?? false, xGoals: x.xGoals, goals: st?.goals ?? 0, position: info(x.playerId).position });
    }

    // prices move by form (fewer than 200 managers)
    if (round < 10) for (const p of players) {
      const next = formPriceChange(priceNow[p.id], startPrice[p.id], expectedPerRound[p.id], ss.points[p.id].slice(Math.max(0, round - 3), round), p.position, rules);
      if (next !== priceNow[p.id]) priceMoves++;
      priceNow[p.id] = next;
    }
  }

  const totals = bots.map(b => b.entry.pointsByRound.reduce((a, x) => a + x, 0) - b.entry.hitsByRound.reduce((a, x) => a + x, 0));
  const order = totals.map((_, i) => i).sort((a, b) => totals[b] - totals[a]);
  const rank: number[] = []; order.forEach((i, k) => { rank[i] = k > 0 && totals[i] === totals[order[k - 1]] ? rank[order[k - 1]] : k + 1; });
  return {
    seed,
    bots: bots.map((b, i) => ({ id: b.id, kind: b.kind, total: totals[i], rank: rank[i], byRound: b.entry.pointsByRound, hits: b.entry.hitsByRound.reduce((a, x) => a + x, 0), transfers: transfers[b.id], wildcardRound: wildcard[b.id] })),
    projections, priceMoves,
  };
}
