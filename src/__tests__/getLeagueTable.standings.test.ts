import { describe, it, expect, vi, beforeEach } from 'vitest';

// getLeagueTable reads the league_standings view (official ordering, split
// formats, deductions) instead of re-deriving a table from matches.
type Call = { method: string; args: unknown[] };
const calls: Record<string, Call[]> = {};
const results: Record<string, { data: unknown; error: unknown }> = {};

function builder(table: string) {
  calls[table] = calls[table] ?? [];
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) {
    b[m] = (...args: unknown[]) => {
      calls[table].push({ method: m, args });
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
  return b;
}

vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => builder(table), rpc: vi.fn() },
}));

import { getLeagueTable } from '../lib/matchesApi';

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(results)) delete results[k];
});

const row = (o: Record<string, unknown>) => ({
  played: 40, won: 20, drawn: 10, lost: 10, goals_for: 60, goals_against: 40,
  deduction: 0, split_adjustment: null, split_group: null, ranked_on: 'points', ...o,
});

describe('getLeagueTable', () => {
  it('keeps the view order (a locked split can put fewer points above more) and maps halving and deductions', async () => {
    results.league_standings = {
      data: [
        row({ team_id: 1, position: 1, points_won: 75, split_adjustment: -25, split_group: 1, points: 50 }),
        row({ team_id: 2, position: 2, points_won: 71, split_adjustment: -23, split_group: 2, points: 48 }),
        row({ team_id: 3, position: 3, points_won: 40, deduction: -3, split_group: 2, points: 37 }),
      ],
      error: null,
    };
    results.point_deductions = { data: [{ deduction_id: 9, team_id: 3, points: -3, reason: 'Ineligible player' }], error: null };
    results.teams = { data: [{ team_id: 1, display_name: 'Club A' }, { team_id: 2, display_name: 'Club B' }, { team_id: 3, display_name: 'Club C' }], error: null };

    const t = await getLeagueTable(18, 7);

    expect(t.map((r) => r.team_name)).toEqual(['Club A', 'Club B', 'Club C']);
    expect(t[0]).toMatchObject({ points: 50, pointsBeforeAdjustment: 50, splitAdjustment: -25, splitGroup: 1, pointsAdjustment: 0 });
    expect(t[2]).toMatchObject({ points: 37, pointsAdjustment: -3, goalDifference: 20 });
    expect(t[2].deductions).toHaveLength(1);
    expect(calls.league_standings).toEqual(expect.arrayContaining([
      { method: 'eq', args: ['league_id', 18] },
      { method: 'eq', args: ['season_id', 7] },
      { method: 'order', args: ['position'] },
    ]));
  });

  it('returns [] when nothing has been played, without looking up teams', async () => {
    results.league_standings = { data: [], error: null };
    expect(await getLeagueTable(1, 13)).toEqual([]);
    expect(calls.teams).toBeUndefined();
  });
});
