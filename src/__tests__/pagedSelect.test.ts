import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectAllPages, chunk, POSTGREST_MAX_ROWS } from '../lib/pagedSelect';
import { postgrestFake } from './helpers/postgrestFake';

// 2,158 rows with minutes > 0, as in season 13 on 22 Oct (audit CODE-04),
// plus some 0-minute rows that must not count.
const gameweeks = Array.from({ length: 2400 }, (_, i) => ({
  season_id: 13,
  fpl_player_id: 1 + (i % 600),
  fpl_fixture_id: 1 + Math.floor(i / 600),
  minutes: i < 2158 ? 90 : 0,
}));

const fake = postgrestFake({ fpl_player_gameweeks: gameweeks });
vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => fake.from(t) } }));
vi.mock('../lib/currentSeason', () => ({ getCurrentFplSeasonId: async () => 13 }));

describe('postgrestFake (1,000-row cap like the real server)', () => {
  it('returns at most 1,000 rows from an unpaged select', async () => {
    const { data } = await fake.from('fpl_player_gameweeks').select('*').gt('minutes', 0);
    expect(data).toHaveLength(POSTGREST_MAX_ROWS);
  });
});

describe('selectAllPages', () => {
  it('reads every row across pages and stops on a short page', async () => {
    const before = fake.calls.length;
    const rows = await selectAllPages((from, to) =>
      fake.from('fpl_player_gameweeks').select('*').gt('minutes', 0).order('fpl_player_id').order('fpl_fixture_id').range(from, to),
    );
    expect(rows).toHaveLength(2158);
    expect(new Set(rows.map((r) => `${r.fpl_player_id}-${r.fpl_fixture_id}`)).size).toBe(2158);
    expect(fake.calls.length - before).toBe(3);
  });

  it('never asks for pages larger than the cap', async () => {
    const asked: [number, number][] = [];
    await selectAllPages(async (from, to) => (asked.push([from, to]), { data: [], error: null }), { pageSize: 5000 });
    expect(asked).toEqual([[0, 999]]);
  });

  it('throws the first error', async () => {
    await expect(selectAllPages(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
  });

  it('stops a runaway loop', async () => {
    await expect(selectAllPages(async () => ({ data: Array(1000).fill(1), error: null }), { maxRows: 3000 })).rejects.toThrow(/stopped after 3000/);
  });

  it('chunks lists', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('getGamesInvolvedCounts (fplApi)', () => {
  beforeEach(() => vi.resetModules());

  it('counts every game with minutes, past the 1,000-row cap', async () => {
    const { getGamesInvolvedCounts } = await import('../lib/fplApi');
    const ids = Array.from({ length: 600 }, (_, i) => i + 1);
    const counts = await getGamesInvolvedCounts(ids);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(2158);
    expect(counts.get(1)).toBe(4); // fixtures 1-4 with minutes; fixture 4 row 1800 < 2158
    expect(counts.get(600)).toBe(3);
  });
});
