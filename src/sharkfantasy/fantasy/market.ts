// ============================================================================
// Shark Fantasy: prices and transfers (design §3.3–3.4).
//   - initial prices from the public projection, within each position's band;
//   - weekly changes by form while there are fewer than 200 managers (form
//     against what the price expected), at most ±0.2 a week, ±0.6 a season;
//   - selling price: FPL's rule, you keep half of any rise (rounded down);
//   - transfers: free ones bank up to 3; each extra costs 4 points, unless
//     a wildcard is played that round.
// ============================================================================
import type { Position } from '../engine/types';
import { GAME_RULES_V1 } from './rules';
import type { GameRules } from './rules';
import type { Entry, PlayerInfo } from './squad';
import { squadProblems } from './squad';

/** Initial prices: each position's projections mapped onto its band by rank. */
export function initialPrices(players: (PlayerInfo & { xp: number })[], rules: GameRules = GAME_RULES_V1): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
    const group = players.filter(p => p.position === pos).sort((a, b) => a.xp - b.xp);
    const [lo, hi] = rules.priceBand[pos];
    group.forEach((p, i) => {
      const q = group.length > 1 ? i / (group.length - 1) : 0.5;
      out[p.id] = Math.round(lo + (hi - lo) * q ** 1.6);
    });
  }
  return out;
}

/** One week's change by form: the last up-to-3 rounds' points against what
 *  the price assumed, a step per 2.5 points' difference, capped. */
export function formPriceChange(now: number, start: number, expectedPerRound: number, recentPoints: number[], position: Position, rules: GameRules = GAME_RULES_V1): number {
  if (!recentPoints.length) return now;
  const form = recentPoints.reduce((a, b) => a + b, 0) / recentPoints.length;
  const step = Math.max(-rules.priceStepMax, Math.min(rules.priceStepMax, Math.round((form - expectedPerRound) / 2.5)));
  const [lo] = rules.priceBand[position];
  const next = Math.max(start - rules.priceSeasonMax, Math.min(start + rules.priceSeasonMax, now + step));
  return Math.max(lo, next);
}

export function sellingPrice(purchase: number, now: number): number {
  return now <= purchase ? now : purchase + Math.floor((now - purchase) / 2);
}

/** Make one transfer (out → in) at current prices. Returns the problems, or [] and updates the entry. */
export function transfer(e: Entry, outId: string, inId: string, price: (id: string) => number, info: (id: string) => PlayerInfo, rules: GameRules = GAME_RULES_V1): string[] {
  const i = e.picks.findIndex(p => p.playerId === outId);
  if (i < 0) return ['not in your squad'];
  if (e.picks.some(p => p.playerId === inId)) return ['already in your squad'];
  if (info(outId).position !== info(inId).position) return ['a transfer must be like for like'];
  const bank = e.bank + sellingPrice(e.picks[i].purchasePrice, price(outId)) - price(inId);
  const picks = e.picks.slice(); picks[i] = { playerId: inId, purchasePrice: price(inId) };
  const problems = squadProblems(picks, info, price, rules, bank);
  if (problems.length) return problems;
  e.picks = picks; e.bank = bank; e.transfersThisRound++;
  // the new player takes the old one's place in the selection
  e.selection = { xi: e.selection.xi.map(id => (id === outId ? inId : id)), bench: e.selection.bench.map(id => (id === outId ? inId : id)),
    captain: e.selection.captain === outId ? inId : e.selection.captain, vice: e.selection.vice === outId ? inId : e.selection.vice };
  return [];
}

/** Several transfers at once, judged on the squad at the end (the order
 *  doesn't matter: the rules apply to the squad at the deadline). */
export function applyTransfers(e: Entry, outIds: string[], inIds: string[], price: (id: string) => number, info: (id: string) => PlayerInfo, rules: GameRules = GAME_RULES_V1): string[] {
  if (outIds.length !== inIds.length) return ['as many in as out'];
  if (!outIds.length) return [];
  const owned = new Map(e.picks.map(p => [p.playerId, p]));
  if (!outIds.every(id => owned.has(id))) return ['not in your squad'];
  if (inIds.some(id => owned.has(id) && !outIds.includes(id))) return ['already in your squad'];
  let bank = e.bank;
  for (const id of outIds) bank += sellingPrice(owned.get(id)!.purchasePrice, price(id));
  for (const id of inIds) bank -= price(id);
  const picks = e.picks.filter(p => !outIds.includes(p.playerId)).concat(inIds.map(id => ({ playerId: id, purchasePrice: price(id) })));
  const problems = squadProblems(picks, info, price, rules, bank);
  if (problems.length) return problems;
  e.picks = picks; e.bank = bank; e.transfersThisRound += outIds.length;
  return [];
}

/** Points cost of this round's transfers. */
export function hitCost(e: Entry, rules: GameRules = GAME_RULES_V1): number {
  if (e.wildcardThisRound) return 0;
  return Math.max(0, e.transfersThisRound - e.freeTransfers) * rules.hit;
}

/** At the deadline: charge hits, roll free transfers on (bank up to 3). */
export function closeTransferWindow(e: Entry, rules: GameRules = GAME_RULES_V1): number {
  const hits = hitCost(e, rules);
  const used = e.wildcardThisRound ? 0 : Math.min(e.freeTransfers, e.transfersThisRound);
  e.freeTransfers = Math.min(rules.maxBankedTransfers, e.freeTransfers - used + rules.freeTransfersPerRound);
  e.transfersThisRound = 0; e.wildcardThisRound = false;
  return hits;
}
