import { describe, it, expect } from 'vitest';
import { sortScoutPlayers, SCOUT_SORT_COLUMNS, type ScoutListPlayer } from '../lib/playerScoutApi';

const p = (over: Partial<ScoutListPlayer>): ScoutListPlayer => ({
  fpl_code: 1, slug: 'x', fpl_player_id: 1, web_name: 'Player', full_name: 'A Player',
  team_name: 'Club', team_id: 1, element_type: 3, now_cost: 50, total_points: 0,
  minutes: 0, goals_scored: 0, assists: 0, clean_sheets: 0, bonus: 0,
  selected_by_percent: 0, points_per_million: 0, seasons_played: 1,
  price_pressure: null, price_direction: null, ...over,
});

describe('scout sorting', () => {
  const rows = [
    p({ fpl_code: 1, web_name: 'Haaland', total_points: 33, now_cost: 156, minutes: 360 }),
    p({ fpl_code: 2, web_name: 'Adams', total_points: 51, now_cost: 70, minutes: 450 }),
    p({ fpl_code: 3, web_name: 'Zub', total_points: 12, now_cost: 45, minutes: 90 }),
  ];

  it('sorts numerically in both directions', () => {
    expect(sortScoutPlayers(rows, 'total_points', 'desc').map((r) => r.total_points)).toEqual([51, 33, 12]);
    expect(sortScoutPlayers(rows, 'total_points', 'asc').map((r) => r.total_points)).toEqual([12, 33, 51]);
  });

  it('sorts names alphabetically, not by their numbers', () => {
    expect(sortScoutPlayers(rows, 'web_name', 'asc').map((r) => r.web_name)).toEqual(['Adams', 'Haaland', 'Zub']);
  });

  it('keeps nulls out of the way whichever direction the column points', () => {
    // An unpriced player shouldn't lead the table just because ascending
    // treats a null as the smallest thing there is.
    const withNull = [...rows, p({ fpl_code: 4, web_name: 'Unpriced', now_cost: null })];
    const asc = sortScoutPlayers(withNull, 'now_cost', 'asc');
    expect(asc[asc.length - 1].web_name).toBe('Unpriced');
  });

  it('does not mutate the array it was given', () => {
    const before = rows.map((r) => r.web_name);
    sortScoutPlayers(rows, 'total_points', 'asc');
    expect(rows.map((r) => r.web_name)).toEqual(before);
  });

  it('every sortable column is a real field on the row', () => {
    // A header that names a column the row doesn't have would sort by
    // undefined and silently do nothing.
    const sample = rows[0] as unknown as Record<string, unknown>;
    for (const col of SCOUT_SORT_COLUMNS) {
      expect(Object.prototype.hasOwnProperty.call(sample, col.key)).toBe(true);
    }
  });
});
