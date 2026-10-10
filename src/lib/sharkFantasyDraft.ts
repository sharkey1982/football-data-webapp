// ============================================================================
// src/lib/sharkFantasyDraft.ts
//
// The team editor's working copy: squad, XI, bench order, captain, vice.
// Pure functions, so the rules shown on the page are the same ones the bots
// and the tests use (src/sharkfantasy/fantasy). The database checks them again
// when the team is saved (sf.save_team); this only explains problems early.
// ============================================================================

import { GAME_RULES_V1 } from '../sharkfantasy/fantasy/rules';
import type { GameRules } from '../sharkfantasy/fantasy/rules';
import { squadProblems, lineupProblems } from '../sharkfantasy/fantasy/squad';
import type { PlayerInfo } from '../sharkfantasy/fantasy/squad';
import { bestXI } from '../sharkfantasy/fantasy/bots';
import type { Position } from '../sharkfantasy/engine/types';

export interface Draft {
  squad: string[];
  xi: string[];
  /** In order: the reserve keeper first, then the outfield bench. */
  bench: string[];
  captain: string | null;
  vice: string | null;
  wildcard: boolean;
}

export const emptyDraft = (): Draft => ({ squad: [], xi: [], bench: [], captain: null, vice: null, wildcard: false });

export function fromSaved(picks: { player_id: string; slot: number; is_captain: boolean; is_vice: boolean }[]): Draft {
  const s = picks.slice().sort((a, b) => a.slot - b.slot);
  return {
    squad: s.map((p) => p.player_id),
    xi: s.filter((p) => p.slot <= 11).map((p) => p.player_id),
    bench: s.filter((p) => p.slot > 11).map((p) => p.player_id),
    captain: s.find((p) => p.is_captain)?.player_id ?? null,
    vice: s.find((p) => p.is_vice)?.player_id ?? null,
    wildcard: false,
  };
}

const count = (ids: string[], pos: Position, info: (id: string) => PlayerInfo) => ids.filter((id) => info(id).position === pos).length;

/** Reserve keeper first; otherwise keep the order. */
function orderBench(bench: string[], info: (id: string) => PlayerInfo): string[] {
  const gk = bench.filter((id) => info(id).position === 'GK');
  return [...gk, ...bench.filter((id) => info(id).position !== 'GK')];
}

export function canAdd(d: Draft, id: string, info: (id: string) => PlayerInfo, R: GameRules = GAME_RULES_V1): boolean {
  const p = info(id);
  return !d.squad.includes(id) && d.squad.length < R.squadSize && count(d.squad, p.position, info) < R.squadMax[p.position];
}

export function addPlayer(d: Draft, id: string, info: (id: string) => PlayerInfo, R: GameRules = GAME_RULES_V1): Draft {
  if (!canAdd(d, id, info, R)) return d;
  const pos = info(id).position;
  const toXi = d.xi.length < 11 && count(d.xi, pos, info) < R.xiMax[pos] && !(pos === 'GK' && count(d.xi, 'GK', info) >= 1);
  return {
    ...d,
    squad: [...d.squad, id],
    xi: toXi ? [...d.xi, id] : d.xi,
    bench: toXi ? d.bench : orderBench([...d.bench, id], info),
  };
}

export function removePlayer(d: Draft, id: string): Draft {
  return {
    ...d,
    squad: d.squad.filter((x) => x !== id),
    xi: d.xi.filter((x) => x !== id),
    bench: d.bench.filter((x) => x !== id),
    captain: d.captain === id ? null : d.captain,
    vice: d.vice === id ? null : d.vice,
  };
}

/** Swap a starter and a bench player (keeps 11 starters). */
export function swap(d: Draft, a: string, b: string, info: (id: string) => PlayerInfo): Draft {
  const [starter, sub] = d.xi.includes(a) ? [a, b] : [b, a];
  if (!d.xi.includes(starter) || !d.bench.includes(sub)) return d;
  const xi = d.xi.map((x) => (x === starter ? sub : x));
  const bench = orderBench(d.bench.map((x) => (x === sub ? starter : x)), info);
  return {
    ...d, xi, bench,
    captain: d.captain === starter ? null : d.captain,
    vice: d.vice === starter ? null : d.vice,
  };
}

/** Move an outfield bench player up or down (the reserve keeper stays first). */
export function moveBench(d: Draft, id: string, dir: -1 | 1, info: (id: string) => PlayerInfo): Draft {
  const out = d.bench.filter((x) => info(x).position !== 'GK'), gk = d.bench.filter((x) => info(x).position === 'GK');
  const i = out.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= out.length) return d;
  [out[i], out[j]] = [out[j], out[i]];
  return { ...d, bench: [...gk, ...out] };
}

export function setCaptain(d: Draft, id: string): Draft {
  if (!d.xi.includes(id)) return d;
  return { ...d, captain: id, vice: d.vice === id ? d.captain : d.vice };
}
export function setVice(d: Draft, id: string): Draft {
  if (!d.xi.includes(id)) return d;
  return { ...d, vice: id, captain: d.captain === id ? d.vice : d.captain };
}

/** The best XI, bench order and captaincy for a score (the public projection). Needs a full squad. */
export function suggest(d: Draft, score: (id: string) => number, info: (id: string) => PlayerInfo, R: GameRules = GAME_RULES_V1): Draft {
  if (d.squad.length !== R.squadSize) return d;
  const s = bestXI(d.squad, score, info, R);
  return { ...d, xi: s.xi, bench: s.bench, captain: s.captain, vice: s.vice };
}

export interface DraftSummary {
  /** Money to spend on the whole squad (tenths). */
  budget: number;
  left: number;
  newPlayers: string[];
  soldPlayers: string[];
  transfers: number;
  free: boolean;
  hits: number;
  problems: string[];
  changed: boolean;
}

export interface SavedTeam {
  bank: number; free_transfers: number; wildcards_left: number; transfers_this_round: number; wildcard_this_round: boolean;
  picks: { player_id: string; slot: number; is_captain: boolean; is_vice: boolean; selling_price: number }[];
}

/**
 * Money, transfers and problems for the draft, as the database will see them.
 * firstDeadline: no deadline has passed for this entry yet, so changes are free
 * and the whole budget is available.
 */
export function summarise(d: Draft, saved: SavedTeam | null, price: (id: string) => number, info: (id: string) => PlayerInfo, firstDeadline: boolean, R: GameRules = GAME_RULES_V1): DraftSummary {
  const owned = new Map((saved?.picks ?? []).map((p) => [p.player_id, p.selling_price]));
  const budget = firstDeadline || !saved?.picks.length ? R.budget : saved.bank + [...owned.values()].reduce((a, b) => a + b, 0);
  const costOf = (id: string) => (!firstDeadline && owned.has(id) ? owned.get(id)! : price(id));
  const left = budget - d.squad.reduce((a, id) => a + costOf(id), 0);
  const newPlayers = d.squad.filter((id) => !owned.has(id));
  const soldPlayers = [...owned.keys()].filter((id) => !d.squad.includes(id));
  const free = firstDeadline;
  const transfers = free ? 0 : (saved?.transfers_this_round ?? 0) + newPlayers.length;
  const wildcard = d.wildcard || !!saved?.wildcard_this_round;
  const hits = free || wildcard ? 0 : Math.max(0, transfers - (saved?.free_transfers ?? 1)) * R.hit;

  const picks = d.squad.map((id) => ({ playerId: id, purchasePrice: price(id) }));
  const problems = [...squadProblems(picks, info, price, R, left)];
  if (d.squad.length === R.squadSize) {
    const lp = lineupProblems({ xi: d.xi, bench: d.bench, captain: d.captain ?? '', vice: d.vice ?? '' }, picks, info, R);
    problems.push(...lp);
  }
  const savedSlots = (saved?.picks ?? []).slice().sort((a, b) => a.slot - b.slot);
  const changed = d.wildcard
    || JSON.stringify(toSave(d).picks) !== JSON.stringify(savedSlots.map((p) => ({ player_id: p.player_id, slot: p.slot })))
    || d.captain !== (savedSlots.find((p) => p.is_captain)?.player_id ?? null)
    || d.vice !== (savedSlots.find((p) => p.is_vice)?.player_id ?? null);
  return { budget, left, newPlayers, soldPlayers, transfers, free, hits, problems, changed };
}

/** Slots: 1–11 the XI (by position), 12 the reserve keeper, 13–15 the bench in order. */
export function toSave(d: Draft, info?: (id: string) => PlayerInfo) {
  const order: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  const xi = info ? d.xi.slice().sort((a, b) => order.indexOf(info(a).position) - order.indexOf(info(b).position)) : d.xi;
  return {
    picks: [...xi.map((id, i) => ({ player_id: id, slot: i + 1 })), ...d.bench.map((id, i) => ({ player_id: id, slot: 12 + i }))],
    captain: d.captain ?? '',
    vice: d.vice ?? '',
    wildcard: d.wildcard,
  };
}
