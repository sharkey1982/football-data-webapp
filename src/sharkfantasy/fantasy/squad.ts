// ============================================================================
// Shark Fantasy: squads, lineups, auto-subs and round scores (design §3).
// Pure functions: the database functions in Phase 3b mirror these rules
// and the tests pin them both to the same examples.
// ============================================================================
import type { Position } from '../engine/types';
import { GAME_RULES_V1 } from './rules';
import type { GameRules } from './rules';

export interface PlayerInfo { id: string; clubId: string; position: Position }
export interface Pick { playerId: string; purchasePrice: number }

/** A manager's team for a round: 15 picks, the XI, the bench in order (GK first), captain and vice. */
export interface Selection {
  xi: string[];
  bench: string[];
  captain: string;
  vice: string;
}

export interface Entry {
  id: string;
  picks: Pick[];
  selection: Selection;
  bank: number;
  freeTransfers: number;
  wildcardsLeft: number;
  /** Transfers made since the last deadline (for hits). */
  transfersThisRound: number;
  wildcardThisRound: boolean;
  pointsByRound: number[];
  hitsByRound: number[];
}

export function squadProblems(picks: Pick[], info: (id: string) => PlayerInfo, price: (id: string) => number, rules: GameRules = GAME_RULES_V1, bank?: number): string[] {
  const out: string[] = [];
  const total = Object.values(rules.squad).reduce((a, b) => a + b, 0);
  if (picks.length !== total) out.push(`${picks.length} players, not ${total}`);
  if (new Set(picks.map(p => p.playerId)).size !== picks.length) out.push('a player picked twice');
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
    const n = picks.filter(p => info(p.playerId).position === pos).length;
    if (n !== rules.squad[pos]) out.push(`${n} ${pos}, not ${rules.squad[pos]}`);
  }
  const clubs: Record<string, number> = {};
  for (const p of picks) clubs[info(p.playerId).clubId] = (clubs[info(p.playerId).clubId] ?? 0) + 1;
  for (const [c, n] of Object.entries(clubs)) if (n > rules.maxPerClub) out.push(`${n} from ${c} (max ${rules.maxPerClub})`);
  if (bank === undefined) {
    const cost = picks.reduce((a, p) => a + price(p.playerId), 0);
    if (cost > rules.budget) out.push(`costs ${cost / 10}, budget ${rules.budget / 10}`);
  } else if (bank < 0) out.push(`overspent by ${-bank / 10}`);
  return out;
}

export function lineupProblems(sel: Selection, picks: Pick[], info: (id: string) => PlayerInfo, rules: GameRules = GAME_RULES_V1): string[] {
  const out: string[] = [];
  const ids = new Set(picks.map(p => p.playerId));
  if (sel.xi.length !== 11) out.push('the XI needs 11');
  if (sel.bench.length !== picks.length - 11) out.push(`the bench needs ${picks.length - 11}`);
  const all = [...sel.xi, ...sel.bench];
  if (new Set(all).size !== all.length || !all.every(id => ids.has(id))) out.push('the XI and bench must be the squad, once each');
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
    const n = sel.xi.filter(id => info(id).position === pos).length;
    if (n < rules.xiMin[pos] || n > rules.xiMax[pos]) out.push(`${n} ${pos} in the XI (${rules.xiMin[pos]}–${rules.xiMax[pos]})`);
  }
  if (sel.bench.length && info(sel.bench[0]).position !== 'GK') out.push('the first bench place is the reserve keeper');
  if (!sel.xi.includes(sel.captain)) out.push('the captain must be in the XI');
  if (!sel.xi.includes(sel.vice) || sel.vice === sel.captain) out.push('the vice-captain must be another player in the XI');
  return out;
}

/** FPL's automatic substitutions: each starter with no minutes is replaced by
 *  the first bench player (in order) who played and keeps a valid formation;
 *  a keeper only by the reserve keeper. */
export function autoSubs(sel: Selection, minutes: (id: string) => number, info: (id: string) => PlayerInfo, rules: GameRules = GAME_RULES_V1): { xi: string[]; subs: [string, string][] } {
  const xi = sel.xi.slice(), bench = sel.bench.slice(), subs: [string, string][] = [];
  const count = (ids: string[], pos: Position) => ids.filter(id => info(id).position === pos).length;
  for (const starter of sel.xi) {
    if (minutes(starter) > 0) continue;
    const isGK = info(starter).position === 'GK';
    for (let i = 0; i < bench.length; i++) {
      const b = bench[i];
      if (minutes(b) <= 0 || (info(b).position === 'GK') !== isGK) continue;
      const trial = xi.map(id => (id === starter ? b : id));
      const ok = (['GK', 'DEF', 'MID', 'FWD'] as Position[]).every(pos => count(trial, pos) >= rules.xiMin[pos] && count(trial, pos) <= rules.xiMax[pos]);
      if (!ok) continue;
      xi.splice(xi.indexOf(starter), 1, b); bench.splice(i, 1); subs.push([starter, b]);
      break;
    }
  }
  return { xi, subs };
}

/** Round score: the XI after auto-subs; captain doubled, or the vice if the captain didn't play. */
export function roundScore(sel: Selection, points: (id: string) => number, minutes: (id: string) => number, info: (id: string) => PlayerInfo, rules: GameRules = GAME_RULES_V1) {
  const { xi, subs } = autoSubs(sel, minutes, info, rules);
  const captainUsed = minutes(sel.captain) > 0 ? sel.captain : minutes(sel.vice) > 0 ? sel.vice : null;
  let total = 0;
  for (const id of xi) total += points(id) * (id === captainUsed ? rules.captainMultiplier : 1);
  return { total, xi, subs, captainUsed };
}
