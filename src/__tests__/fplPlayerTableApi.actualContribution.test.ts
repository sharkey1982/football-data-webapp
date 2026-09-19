import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

function makeBuilder(filteredInitial: any[]) {
  let filtered = filteredInitial;
  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => {
      filtered = filtered.filter((r: any) => r[col] === val);
      return api;
    },
    in: (col: string, vals: any[]) => {
      filtered = filtered.filter((r: any) => vals.includes(r[col]));
      return api;
    },
    gte: (col: string, val: any) => {
      filtered = filtered.filter((r: any) => r[col] >= val);
      return api;
    },
    lte: (col: string, val: any) => {
      filtered = filtered.filter((r: any) => r[col] <= val);
      return api;
    },
    range: (from: number, to: number) => Promise.resolve({ data: filtered.slice(from, to + 1), error: null }),
    // Makes the builder itself awaitable for chains that don't end in
    // .range() (fixtures, fpl_players, teams) -- matches real supabase-js,
    // where every query builder is a thenable.
    then: (resolve: any) => resolve({ data: filtered, error: null }),
  };
  return api;
}

describe('actual-points contribution reconstruction (via getPlayerGameweekPointsRange)', () => {
  it('reconstructs a real MID gameweek to the exact official total -- Gro\u00df, GW4: 17 points', async () => {
    const data: Record<string, any[]> = {
      fixtures: [{ fixture_id: 40, matchweek: 4, league_id: 1, season_id: 13 }],
      // fpl_player_gameweeks keys on FPL's own fixture id, which differs
      // from the canonical one -- the mapping table is what joins them.
      fpl_fixtures: [{ fpl_fixture_id: 40, canonical_fixture_id: 40, season_id: 13 }],
      fpl_player_projections: [],
      fpl_player_gameweeks: [
        {
          fpl_player_id: 501,
          fpl_fixture_id: 40,
          total_points: 17,
          minutes: 90,
          goals_scored: 1,
          assists: 2,
          clean_sheets: 1,
          goals_conceded: 0,
          own_goals: 0,
          penalties_saved: 0,
          penalties_missed: 0,
          yellow_cards: 0,
          red_cards: 0,
          saves: 0,
          bonus: 3,
          source_payload: { stats: { clearances_blocks_interceptions: 2, recoveries: 2, tackles: 2 } },
        },
      ],
      fpl_players: [{ fpl_player_id: 501, web_name: 'Test MID', element_type: 3, canonical_team_id: 1, season_id: 13, now_cost: 65 }],
      teams: [{ team_id: 1, canonical_name: 'Arsenal' }],
    };

    const { supabase } = await import('../lib/supabase');
    (supabase.from as any) = (table: string) => makeBuilder(data[table] ? [...data[table]] : []);

    const { getPlayerGameweekPointsRange } = await import('../lib/fplPlayerTableApi');
    const result = await getPlayerGameweekPointsRange(4, 4);
    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.actual_points).toBe(17);
    expect(row.actual_contribution).not.toBeNull();
    const c = row.actual_contribution!;
    // 90 mins=2, 1 goal (MID=5)=5, 2 assists=6, clean sheet (MID)=1,
    // def. contribution: cbi+tackles+recoveries=6 < 12 threshold=0, bonus=3
    expect(c.appearance).toBe(2);
    expect(c.goals).toBe(5);
    expect(c.assists).toBe(6);
    expect(c.cleanSheet).toBe(1);
    expect(c.defensiveContribution).toBe(0);
    expect(c.bonus).toBe(3);
    const total = c.appearance + c.goals + c.assists + c.cleanSheet + c.defensiveContribution + c.saves + c.bonus + c.goalsConceded + c.penalties + c.cardsOwnGoals;
    expect(total).toBe(17);
  });

  it('reconstructs a real GK gameweek to the exact official total -- Raya, GW4: 14 points', async () => {
    const data: Record<string, any[]> = {
      fixtures: [{ fixture_id: 40, matchweek: 4, league_id: 1, season_id: 13 }],
      // fpl_player_gameweeks keys on FPL's own fixture id, which differs
      // from the canonical one -- the mapping table is what joins them.
      fpl_fixtures: [{ fpl_fixture_id: 40, canonical_fixture_id: 40, season_id: 13 }],
      fpl_player_projections: [],
      fpl_player_gameweeks: [
        {
          fpl_player_id: 502,
          fpl_fixture_id: 40,
          total_points: 14,
          minutes: 90,
          goals_scored: 0,
          assists: 0,
          clean_sheets: 1,
          goals_conceded: 0,
          own_goals: 0,
          penalties_saved: 1,
          penalties_missed: 0,
          yellow_cards: 0,
          red_cards: 0,
          saves: 2,
          bonus: 3,
          source_payload: { stats: {} },
        },
      ],
      fpl_players: [{ fpl_player_id: 502, web_name: 'Test GK', element_type: 1, canonical_team_id: 1, season_id: 13, now_cost: 50 }],
      teams: [{ team_id: 1, canonical_name: 'Arsenal' }],
    };

    const { supabase } = await import('../lib/supabase');
    (supabase.from as any) = (table: string) => makeBuilder(data[table] ? [...data[table]] : []);

    const { getPlayerGameweekPointsRange } = await import('../lib/fplPlayerTableApi');
    const result = await getPlayerGameweekPointsRange(4, 4);
    const c = result[0].actual_contribution!;
    // 90 mins=2, clean sheet (GK)=4, 2 saves -> floor(2/3)=0, penalty save=5, bonus=3
    expect(c.appearance).toBe(2);
    expect(c.cleanSheet).toBe(4);
    expect(c.saves).toBe(0);
    expect(c.penalties).toBe(5);
    expect(c.bonus).toBe(3);
    const total = c.appearance + c.goals + c.assists + c.cleanSheet + c.defensiveContribution + c.saves + c.bonus + c.goalsConceded + c.penalties + c.cardsOwnGoals;
    expect(total).toBe(14);
  });
});
