import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import { bestXi, lineupScore, quickWins, sellingPrice, squadScore, type CheckPlayer, type Position, type SquadPlayer } from '../lib/squadCheck';

let nextId = 1;
const player = (pos: Position, pts: number, o: Partial<CheckPlayer> = {}): CheckPlayer => {
  const id = nextId++;
  return { id, name: `P${id}`, slug: null, team: `T${id}`, teamId: 100 + id, pos, price: 50, gw: { 6: pts }, total: pts, ...o };
};
const own = (p: CheckPlayer, slot: number, o: Partial<SquadPlayer> = {}): SquadPlayer => ({ ...p, sell: p.price, slot, isCaptain: false, purchaseKnown: true, ...o });

// 2 GK, 5 DEF, 5 MID, 3 FWD
function squad(): SquadPlayer[] {
  const pts: [Position, number][] = [[1, 4], [1, 2], [2, 5], [2, 4], [2, 3], [2, 2], [2, 1], [3, 7], [3, 6], [3, 5], [3, 1], [3, 0.5], [4, 8], [4, 3], [4, 0.2]];
  return pts.map(([pos, x], i) => own(player(pos, x), i + 1));
}

describe('selling price', () => {
  it('keeps half of a rise, rounded down, and all of a fall', () => {
    expect(sellingPrice(58, 55)).toBe(56);
    expect(sellingPrice(57, 55)).toBe(56);
    expect(sellingPrice(56, 55)).toBe(55);
    expect(sellingPrice(53, 55)).toBe(53);
  });
});

describe('best XI', () => {
  it('fills the minimums, then the best of the rest within the maximums, and doubles the captain', () => {
    const s = squad();
    const r = bestXi(s, 6);
    expect(r.xi).toHaveLength(11);
    const byPos = (pos: Position) => s.filter((p) => r.xi.includes(p.id) && p.pos === pos).length;
    expect([byPos(1), byPos(2), byPos(3), byPos(4)]).toEqual([1, 5, 3, 2]);
    // 4 + (5+4+3+2+1) + (7+6+5) + (8+3) + captain 8: the 1-point defender beats the 0.2-point third forward
    expect(r.points).toBeCloseTo(4 + 15 + 18 + 11 + 8);
    expect(squadScore(s, [6])).toBeCloseTo(r.points);
  });

  it('scores the line-up as picked', () => {
    const s = squad();
    s[7].isCaptain = true; // the 7-point midfielder
    const xiPts = s.slice(0, 11).reduce((t, p) => t + p.gw[6], 0);
    expect(lineupScore(s, 6)).toBeCloseTo(xiPts + 7);
  });
});

describe('quick wins', () => {
  it('measures the gain to the squad, so a bench swap only counts if the new player gets in the team', () => {
    const s = squad(); // backup keeper s[1] scores 2, starter s[0] scores 4
    const betterBackup = player(1, 3, { price: 40 });
    const betterStarter = player(1, 6, { price: 40 });
    expect(quickWins(s, [...s, betterBackup], 0, 0.1, [6])).toEqual([]);
    const w = quickWins(s, [...s, betterStarter], 0, 0.1, [6]);
    expect(w).toHaveLength(1);
    expect(w[0].in.id).toBe(betterStarter.id);
    expect(w[0].gain).toBeCloseTo(2);
  });

  it('counts captaincy: a new top scorer gains his points twice over the old captain', () => {
    const s = squad(); // captain is the 8-point forward
    const star = player(4, 12, { price: 50 });
    const w = quickWins(s, [...s, star], 0, 0.1, [6]);
    // Best swap is the 0.2-point bench forward: the XI keeps 8 and 3, adds 12 in place of the
    // 1-point defender, and the captain goes 8 -> 12: gain (12 - 1) + (12 - 8) = 15
    expect(w[0].out.gw[6]).toBeCloseTo(0.2);
    expect(w[0].gain).toBeCloseTo(15);
  });

  it('respects the bank and three per club, and lists each incoming player once', () => {
    const s = squad();
    const cheapStar = player(3, 6, { price: 55 });
    const pricey = player(3, 9, { price: 80 });
    const clubFull = player(3, 8, { price: 50, teamId: 999 });
    s[2].teamId = 999; s[3].teamId = 999; s[4].teamId = 999; // three defenders: a fourth from 999 is out for any midfield swap
    const wins = quickWins(s, [...s, cheapStar, pricey, clubFull], 5, 0.1, [6]);
    expect(wins.map((w) => w.in.id)).toEqual([cheapStar.id]); // pricey unaffordable, clubFull breaks the club rule
    expect(wins[0].cost).toBe(5);
  });

  it('drops swaps under the minimum gain', () => {
    const s = squad();
    const f = player(4, 3.5); // in for the 0.2 bench forward, it displaces the 1-point defender: +2.5
    expect(quickWins(s, [...s, f], 0, 2, [6]).map((w) => +w.gain.toFixed(2))).toEqual([2.5]);
    expect(quickWins(s, [...s, f], 0, 3, [6])).toEqual([]);
  });
});

import { assembleEntry, type RawEntry } from '../lib/squadCheck';

describe('assembling the squad from FPL', () => {
  const pick = (element: number, position: number, cap = false) => ({ element, position, is_captain: cap, is_vice_captain: false, multiplier: position <= 11 ? (cap ? 2 : 1) : 0 });
  const picks = (ids: number[], bank: number, chip: string | null = null) => ({ active_chip: chip, bank, picks: ids.map((id, i) => pick(id, i + 1, i === 0)) });
  const ids = (from: number) => Array.from({ length: 15 }, (_, i) => from + i);
  const base = (o: Partial<RawEntry> = {}): RawEntry => ({
    status: 'ok',
    entry: { id: 7, name: 'Test XI', current_event: 5, last_deadline_bank: 12, overall_rank: 100, total_points: 300 },
    chips: [],
    transfers: [],
    picks: picks(ids(1), 12),
    prev_picks: null,
    ...o,
  });

  it('uses the last deadline squad and bank', () => {
    const e = assembleEntry(base());
    expect(e.squad.map((s) => s.element)).toEqual(ids(1));
    expect(e.bank).toBe(12);
    expect(e.squad_event).toBe(5);
  });

  it('reverts a Free Hit: the week before squad and bank, and ignores Free Hit transfers for prices', () => {
    const e = assembleEntry(base({
      chips: [{ name: 'freehit', event: 5 }],
      picks: picks(ids(100), 0, 'freehit'),
      prev_picks: picks(ids(1), 30),
      transfers: [
        { element_in: 3, element_in_cost: 61, element_out: 90, element_out_cost: 60, event: 4, time: '2026-09-10T10:00:00Z' },
        { element_in: 3, element_in_cost: 70, element_out: 1, element_out_cost: 60, event: 5, time: '2026-09-18T10:00:00Z' },
      ],
    }));
    expect(e.free_hit_reverted).toBe(true);
    expect(e.squad_event).toBe(4);
    expect(e.squad.map((s) => s.element)).toEqual(ids(1));
    expect(e.bank).toBe(30);
    expect(e.squad.find((s) => s.element === 3)!.purchase_price).toBe(61);
    expect(e.squad.find((s) => s.element === 2)!.purchase_price).toBeNull();
  });

  it('applies transfers already listed for the next gameweek', () => {
    const e = assembleEntry(base({ transfers: [{ element_in: 200, element_in_cost: 55, element_out: 4, element_out_cost: 50, event: 6, time: '2026-09-29T10:00:00Z' }] }));
    expect(e.pending_transfers).toBe(1);
    expect(e.squad.map((s) => s.element)).toContain(200);
    expect(e.squad.map((s) => s.element)).not.toContain(4);
    expect(e.bank).toBe(12 - 5);
    expect(e.squad.find((s) => s.element === 200)!.purchase_price).toBe(55);
  });

  it('turns FPL failures into plain messages', () => {
    expect(() => assembleEntry({ status: 'not_found' })).toThrow('No FPL team with that ID.');
    expect(() => assembleEntry({ status: 'unavailable', fpl_status: 403 })).toThrow(/isn’t responding/);
  });
});
