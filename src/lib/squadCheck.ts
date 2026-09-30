// ============================================================================
// src/lib/squadCheck.ts
//
// Rate My Team (/fpl/rate-my-team; was Squad Check): a manager's real FPL squad, by FPL ID,
// against the model.
//
//  - The squad comes from fpl_entry_fetch() (the FPL API's public endpoints,
//    called from the database, which FPL accepts; nothing stored), assembled
//    here: the squad at the last deadline, a Free Hit reverted, and any
//    transfers FPL already lists applied.
//  - Selling prices follow FPL's rule: half of any rise (rounded down to
//    £0.1m), all of any fall. Purchase price is the latest transfer in, or,
//    for players held since the squad was first picked, the season-start
//    price (now_cost - cost_change_start).
//  - Points are the model's projections (fpl_player_projections via
//    getPlayerGameweekPointsRange). A squad's score for a gameweek is its
//    best legal XI plus the captain's points again -- the same measure for
//    the manager's squad and the model's squad, so the two compare fairly.
//  - Quick wins: single swaps, same position, affordable from the selling
//    price plus the bank, within the three-per-club rule, that raise the
//    squad's score (best XI + captain each week) by at least the chosen
//    number of points over the range.
//
// Pure functions are exported for tests.
// ============================================================================

import { supabase } from './supabase';
import { getPlayerGameweekPointsRange } from './fplPlayerTableApi';
import { getCurrentFplSeasonId } from './currentSeason';

export type FplEntry = {
  entry_id: number;
  team_name: string | null;
  overall_rank: number | null;
  total_points: number | null;
  current_event: number;
  squad_event: number;
  free_hit_reverted: boolean;
  pending_transfers: number;
  /** Tenths of £1m, as FPL gives it. */
  bank: number;
  squad: { element: number; slot: number; is_captain: boolean; is_vice_captain: boolean; multiplier: number; purchase_price: number | null }[];
  chips_used: { name: string; event: number }[];
};

type RawPicks = { active_chip: string | null; bank: number | null; picks: { element: number; position: number; is_captain: boolean; is_vice_captain: boolean; multiplier: number }[] };
export type RawEntry = {
  status: 'ok' | 'bad_id' | 'busy' | 'not_found' | 'not_started' | 'unavailable';
  fpl_status?: number;
  entry?: { id: number; name: string | null; current_event: number; last_deadline_bank: number | null; overall_rank: number | null; total_points: number | null };
  chips?: { name: string; event: number }[];
  transfers_known?: boolean;
  transfers?: { element_in: number; element_in_cost: number; element_out: number; element_out_cost: number; event: number; time: string }[];
  picks?: RawPicks;
  prev_picks?: RawPicks | null;
};

const MESSAGES: Record<Exclude<RawEntry['status'], 'ok'>, string> = {
  bad_id: 'Your FPL ID is a number, up to 8 digits.',
  busy: 'Rate My Team is busy. Try again in a minute.',
  not_found: 'No FPL team with that ID.',
  not_started: 'This team hasn’t played a gameweek yet.',
  unavailable: 'The FPL site isn’t responding. Try again in a minute.',
};

/**
 * The squad to plan from, from the raw FPL pieces:
 *  - the picks at the last deadline, or, after a Free Hit, the week before's
 *    (the squad and bank revert);
 *  - plus transfers FPL already lists for a later gameweek (bank adjusted by
 *    the sale and purchase prices FPL recorded);
 *  - purchase price per player: the latest transfer in, ignoring Free Hit
 *    weeks; null when held since the squad was first picked.
 */
export function assembleEntry(raw: RawEntry): FplEntry {
  if (raw.status !== 'ok' || !raw.entry || !raw.picks) throw new Error(MESSAGES[raw.status === 'ok' ? 'unavailable' : raw.status]);
  const event = raw.entry.current_event;
  const freeHit = raw.picks.active_chip === 'freehit' && raw.prev_picks != null;
  const base = freeHit ? raw.prev_picks! : raw.picks;
  let bank = freeHit ? base.bank ?? 0 : raw.entry.last_deadline_bank ?? base.bank ?? 0;
  const freeHitWeeks = new Set((raw.chips ?? []).filter((c) => c.name === 'freehit').map((c) => c.event));
  const transfers = (raw.transfers ?? []).filter((t) => !freeHitWeeks.has(t.event)).sort((a, b) => a.time.localeCompare(b.time));

  const squad = base.picks.map((p) => ({ element: p.element, slot: p.position, is_captain: p.is_captain, is_vice_captain: p.is_vice_captain, multiplier: p.multiplier }));
  const pending = transfers.filter((t) => t.event > event);
  for (const t of pending) {
    const i = squad.findIndex((s) => s.element === t.element_out);
    if (i < 0) continue;
    squad[i] = { element: t.element_in, slot: squad[i].slot, is_captain: false, is_vice_captain: false, multiplier: squad[i].multiplier };
    bank += t.element_out_cost - t.element_in_cost;
  }
  const purchase = new Map<number, number>();
  for (const t of transfers) purchase.set(t.element_in, t.element_in_cost);

  return {
    entry_id: raw.entry.id,
    team_name: raw.entry.name,
    overall_rank: raw.entry.overall_rank,
    total_points: raw.entry.total_points,
    current_event: event,
    squad_event: freeHit ? event - 1 : event,
    free_hit_reverted: freeHit,
    pending_transfers: pending.length,
    bank,
    squad: squad.map((s) => ({ ...s, purchase_price: purchase.get(s.element) ?? null })),
    chips_used: raw.chips ?? [],
  };
}

export async function fetchFplEntry(entryId: number): Promise<FplEntry> {
  const { data, error } = await supabase.rpc('fpl_entry_fetch' as never, { p_entry_id: entryId } as never);
  if (error) throw new Error('Couldn’t reach FPL just now. Try again in a minute.');
  return assembleEntry(data as unknown as RawEntry);
}

/** FPL's selling price, in tenths: purchase plus half of any rise (rounded down); a fall is taken in full. */
export function sellingPrice(now: number, purchase: number): number {
  return now > purchase ? purchase + Math.floor((now - purchase) / 2) : now;
}

export type Position = 1 | 2 | 3 | 4;
export const POSITION_LABEL: Record<Position, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export type CheckPlayer = {
  id: number;
  name: string;
  slug: string | null;
  team: string;
  teamId: number;
  pos: Position;
  /** Current price, tenths. */
  price: number;
  /** Projected points by gameweek, and summed over the range. */
  gw: Record<number, number>;
  total: number;
};

export type SquadPlayer = CheckPlayer & { sell: number; slot: number; isCaptain: boolean; purchaseKnown: boolean };

const XI_MIN: Record<Position, number> = { 1: 1, 2: 3, 3: 2, 4: 1 };
const XI_MAX: Record<Position, number> = { 1: 1, 2: 5, 3: 5, 4: 3 };

/**
 * Best legal XI for one gameweek and the captain (highest projected in it).
 * Greedy is exact here: fill each position's minimum with its best players,
 * then the remaining places with the best of the rest under the maximums.
 */
export function bestXi(squad: CheckPlayer[], gw: number): { xi: number[]; captain: number | null; points: number } {
  const pts = (p: CheckPlayer) => p.gw[gw] ?? 0;
  const byPos = (pos: Position) => squad.filter((p) => p.pos === pos).sort((a, b) => pts(b) - pts(a));
  const chosen: CheckPlayer[] = [];
  const count: Record<Position, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const pos of [1, 2, 3, 4] as Position[]) {
    for (const p of byPos(pos).slice(0, XI_MIN[pos])) {
      chosen.push(p);
      count[pos]++;
    }
  }
  const rest = squad.filter((p) => p.pos !== 1 && !chosen.includes(p)).sort((a, b) => pts(b) - pts(a));
  for (const p of rest) {
    if (chosen.length >= 11) break;
    if (count[p.pos] >= XI_MAX[p.pos]) continue;
    chosen.push(p);
    count[p.pos]++;
  }
  const captain = chosen.length ? chosen.reduce((a, b) => (pts(b) > pts(a) ? b : a)) : null;
  const points = chosen.reduce((s, p) => s + pts(p), 0) + (captain ? pts(captain) : 0);
  return { xi: chosen.map((p) => p.id), captain: captain?.id ?? null, points };
}

/**
 * Best XI + captain points for one week from parallel arrays -- the fast path
 * for searches that score thousands of squads. One pass down the players in
 * points order: take the best keeper, then an outfield player whenever his
 * position has room and taking him still leaves enough places for the other
 * positions' minimums. Gives the same total as bestXi().
 */
function xiPoints(pts: number[], pos: Position[]): number {
  const order = pts.map((_, i) => i).sort((a, b) => pts[b] - pts[a]);
  const need: Record<number, number> = { 2: XI_MIN[2], 3: XI_MIN[3], 4: XI_MIN[4] };
  const cnt: Record<number, number> = { 2: 0, 3: 0, 4: 0 };
  let slots = 10;
  let sum = 0;
  let cap = -Infinity;
  let keeper = false;
  for (const i of order) {
    const p = pos[i];
    if (p === 1) {
      if (!keeper) {
        keeper = true;
        sum += pts[i];
        cap = Math.max(cap, pts[i]);
      }
      continue;
    }
    if (slots === 0 || cnt[p] >= XI_MAX[p]) continue;
    let unmet = 0;
    for (const q of [2, 3, 4]) unmet += Math.max(0, need[q] - cnt[q] - (q === p ? 1 : 0));
    if (slots - 1 < unmet) continue;
    cnt[p]++;
    slots--;
    sum += pts[i];
    cap = Math.max(cap, pts[i]);
  }
  return sum + (cap === -Infinity ? 0 : cap);
}

/** A squad's projected score over a range: each week's best XI plus captain. */
export function squadScore(squad: CheckPlayer[], weeks: number[]): number {
  const pos = squad.map((p) => p.pos);
  let total = 0;
  for (const w of weeks) total += xiPoints(squad.map((p) => p.gw[w] ?? 0), pos);
  return total;
}

/** The manager's own line-up (slots 1-11, their captain) projected for one gameweek. */
export function lineupScore(squad: SquadPlayer[], gw: number): number {
  const xi = squad.filter((p) => p.slot <= 11);
  const cap = xi.find((p) => p.isCaptain);
  return xi.reduce((s, p) => s + (p.gw[gw] ?? 0), 0) + (cap ? cap.gw[gw] ?? 0 : 0);
}

export type QuickWin = { out: SquadPlayer; in: CheckPlayer; gain: number; cost: number };

/**
 * The best single swap for each squad player, measured by the change in the
 * squad's score over the range (best XI + captain each week) -- so a bench
 * swap only counts if the new player would get into the team. Same position,
 * affordable (selling price + bank), within three per club, not already in
 * the squad. Each incoming player is listed once (for the swap that gains
 * most). Only gains of at least minGain, biggest first.
 */
export function quickWins(squad: SquadPlayer[], pool: CheckPlayer[], bank: number, minGain: number, weeks: number[]): QuickWin[] {
  const owned = new Set(squad.map((p) => p.id));
  const clubCount = new Map<number, number>();
  for (const p of squad) clubCount.set(p.teamId, (clubCount.get(p.teamId) ?? 0) + 1);
  const baseScore = squadScore(squad, weeks);
  const best: QuickWin[] = [];
  for (const o of squad) {
    const budget = o.sell + bank;
    const others = squad.filter((p) => p !== o);
    let top: QuickWin | null = null;
    for (const c of pool) {
      if (c.pos !== o.pos || owned.has(c.id) || c.price > budget) continue;
      if ((clubCount.get(c.teamId) ?? 0) - (c.teamId === o.teamId ? 1 : 0) >= 3) continue;
      const gain = squadScore([...others, c], weeks) - baseScore;
      if (!top || gain > top.gain + 1e-9 || (Math.abs(gain - top.gain) < 1e-9 && c.price < top.in.price)) top = { out: o, in: c, gain, cost: c.price - o.sell };
    }
    if (top && top.gain >= minGain) best.push(top);
  }
  best.sort((a, b) => b.gain - a.gain);
  const seen = new Set<number>();
  return best.filter((w) => (seen.has(w.in.id) ? false : (seen.add(w.in.id), true)));
}

/** The squad after one transfer; the new player's selling price is what he costs now. */
export function applySwap(squad: SquadPlayer[], out: SquadPlayer, incoming: CheckPlayer): SquadPlayer[] {
  return squad.map((p) => (p === out ? { ...incoming, sell: incoming.price, slot: out.slot, isCaptain: false, purchaseKnown: true } : p));
}

export type PlanMove = QuickWin & {
  when: 'now' | 'next';
  /** For a next-week move: what it would add in the first gameweek if made now instead (what a -4 hit would buy). */
  firstWeekValue?: number;
};

/**
 * A transfer plan: the best single swap, then the best one on the new squad,
 * and so on, for each free transfer this week; then one more for next week's
 * free transfer, scored over the rest of the range, with its first-week value
 * so the page can say whether taking it now for a hit would pay (only if that
 * one week's gain is over 4).
 */
export function transferPlan(squad: SquadPlayer[], pool: CheckPlayer[], bank: number, weeks: number[], freeTransfers: number, minGain: number): PlanMove[] {
  const moves: PlanMove[] = [];
  let sq = squad;
  let money = bank;
  for (let i = 0; i < freeTransfers; i++) {
    const w = quickWins(sq, pool, money, minGain, weeks)[0];
    if (!w) break;
    moves.push({ ...w, when: 'now' });
    sq = applySwap(sq, w.out, w.in);
    money -= w.cost;
  }
  if (weeks.length > 1) {
    const later = weeks.slice(1);
    const w = quickWins(sq, pool, money, minGain, later)[0];
    if (w) {
      const first = [weeks[0]];
      moves.push({ ...w, when: 'next', firstWeekValue: squadScore(applySwap(sq, w.out, w.in), first) - squadScore(sq, first) });
    }
  }
  return moves;
}

export type PairMove = { outs: [SquadPlayer, SquadPlayer]; ins: [CheckPlayer, CheckPlayer]; gain: number; cost: number };

/**
 * The best two-transfer move made together, searched over each position's
 * top players (by points over the range) and best value for money, so a
 * downgrade that pays for an upgrade is found. Same rules as single swaps,
 * on the combined budget.
 */
export function bestPair(squad: SquadPlayer[], pool: CheckPlayer[], bank: number, weeks: number[], perPosition = 10, valuePicks = 5): PairMove | null {
  const owned = new Set(squad.map((p) => p.id));
  const base = squadScore(squad, weeks);
  const cands = new Map<Position, CheckPlayer[]>();
  for (const pos of [1, 2, 3, 4] as Position[]) {
    const all = pool.filter((c) => c.pos === pos && !owned.has(c.id) && c.total > 0);
    const byPoints = [...all].sort((a, b) => b.total - a.total).slice(0, perPosition);
    const byValue = [...all].sort((a, b) => b.total / Math.max(a.price, 40) - a.total / Math.max(b.price, 40)).slice(0, valuePicks);
    cands.set(pos, [...new Map([...byPoints, ...byValue].map((c) => [c.id, c])).values()]);
  }
  let best: PairMove | null = null;
  for (let i = 0; i < squad.length; i++) {
    for (let j = i + 1; j < squad.length; j++) {
      const a = squad[i];
      const b = squad[j];
      const budget = a.sell + b.sell + bank;
      const rest = squad.filter((p) => p !== a && p !== b);
      const clubs = new Map<number, number>();
      for (const p of rest) clubs.set(p.teamId, (clubs.get(p.teamId) ?? 0) + 1);
      for (const ca of cands.get(a.pos)!) {
        if (ca.price > budget || (clubs.get(ca.teamId) ?? 0) >= 3) continue;
        for (const cb of cands.get(b.pos)!) {
          if (cb === ca || ca.price + cb.price > budget) continue;
          if ((clubs.get(cb.teamId) ?? 0) + (cb.teamId === ca.teamId ? 1 : 0) >= 3) continue;
          const gain = squadScore([...rest, ca, cb], weeks) - base;
          if (!best || gain > best.gain) best = { outs: [a, b], ins: [ca, cb], gain, cost: ca.price + cb.price - a.sell - b.sell };
        }
      }
    }
  }
  return best;
}

/** Every player's projections over the range, keyed by FPL id. */
export async function loadPool(from: number, to: number): Promise<Map<number, CheckPlayer>> {
  const rows = await getPlayerGameweekPointsRange(from, to);
  const pool = new Map<number, CheckPlayer>();
  for (const r of rows) {
    if (!r.fpl_position || r.price == null) continue;
    let p = pool.get(r.fpl_player_id);
    if (!p) {
      p = { id: r.fpl_player_id, name: r.web_name, slug: r.slug, team: r.team_name, teamId: r.team_id, pos: r.fpl_position as Position, price: Math.round(r.price * 10), gw: {}, total: 0 };
      pool.set(p.id, p);
    }
    if (r.projected_points != null) {
      p.gw[r.matchweek] = (p.gw[r.matchweek] ?? 0) + r.projected_points; // double gameweeks add up
      p.total += r.projected_points;
    }
  }
  return pool;
}

/** Squad members with prices and selling prices; anyone missing from the pool (left the league) scores 0. */
export async function buildSquad(entry: FplEntry, pool: Map<number, CheckPlayer>): Promise<SquadPlayer[]> {
  const ids = entry.squad.map((s) => s.element);
  const { data, error } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name, slug, element_type, now_cost, canonical_team_id, source_payload->cost_change_start')
    .eq('season_id', await getCurrentFplSeasonId())
    .in('fpl_player_id', ids);
  if (error) throw error;
  const meta = new Map(
    ((data ?? []) as unknown as { fpl_player_id: number; web_name: string; slug: string | null; element_type: number; now_cost: number; canonical_team_id: number; cost_change_start: number | null }[]).map((m) => [m.fpl_player_id, m])
  );
  return entry.squad.map((s) => {
    const m = meta.get(s.element);
    const base: CheckPlayer = pool.get(s.element) ?? {
      id: s.element, name: m?.web_name ?? `Player ${s.element}`, slug: m?.slug ?? null, team: '', teamId: m?.canonical_team_id ?? -s.element,
      pos: (m?.element_type ?? 3) as Position, price: m?.now_cost ?? 0, gw: {}, total: 0,
    };
    const now = m?.now_cost ?? base.price;
    const start = m ? m.now_cost - (Number(m.cost_change_start) || 0) : now;
    const purchase = s.purchase_price ?? start;
    return { ...base, price: now, sell: sellingPrice(now, purchase), slot: s.slot, isCaptain: s.is_captain, purchaseKnown: s.purchase_price != null };
  });
}

export const money = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;
