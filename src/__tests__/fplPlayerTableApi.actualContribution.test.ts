import { describe, it, expect, vi } from 'vitest';

// The current season comes from the database (docs/season-rollover.md).
vi.mock('../lib/currentSeason', () => ({
  getCurrentFplSeasonId: () => Promise.resolve(13),
  getCurrentSeasonId: () => Promise.resolve(13),
}));
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

describe('double gameweeks (via getPlayerGameweekPointsRange)', () => {
  it('adds both fixtures of a double gameweek instead of keeping only the last', async () => {
    const gw = (fid: number, pts: number, goals: number) => ({
      fpl_player_id: 601, fpl_fixture_id: fid, total_points: pts, minutes: 90, goals_scored: goals, assists: 0, clean_sheets: 0,
      goals_conceded: 1, own_goals: 0, penalties_saved: 0, penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0,
      source_payload: { stats: {} },
    });
    const proj = (fid: number, pts: number, sp: number) => ({
      fpl_player_id: 601, fixture_id: fid, model_version: 'leaguewide_v6', expected_fpl_points: pts, xpts_appearance: 1.8, xpts_goals: pts - 1.8,
      xpts_assists: 0, xpts_clean_sheet: 0, xpts_saves: 0, xpts_defensive_contribution: 0, xpts_cards_own_goals: 0, xpts_bonus: 0,
      xpts_goals_conceded: 0, xpts_penalties: 0, start_probability: sp,
    });
    const data: Record<string, any[]> = {
      fixtures: [
        { fixture_id: 70, matchweek: 7, league_id: 1, season_id: 13 },
        { fixture_id: 71, matchweek: 7, league_id: 1, season_id: 13 },
        { fixture_id: 80, matchweek: 8, league_id: 1, season_id: 13 },
        { fixture_id: 81, matchweek: 8, league_id: 1, season_id: 13 },
      ],
      fpl_fixtures: [70, 71, 80, 81].map((id) => ({ fpl_fixture_id: id, canonical_fixture_id: id, season_id: 13 })),
      // GW7 played twice; GW8 projected twice.
      fpl_player_gameweeks: [gw(70, 6, 1), gw(71, 2, 0)],
      fpl_player_projections: [proj(80, 5, 0.9), proj(81, 4, 0.8)],
      fpl_players: [{ fpl_player_id: 601, web_name: 'Twice', element_type: 4, canonical_team_id: 1, season_id: 13, now_cost: 80 }],
      teams: [{ team_id: 1, canonical_name: 'Arsenal' }],
    };
    const { supabase } = await import('../lib/supabase');
    (supabase.from as any) = (table: string) => makeBuilder(data[table] ? [...data[table]] : []);
    const { getPlayerGameweekPointsRange } = await import('../lib/fplPlayerTableApi');
    const rows = await getPlayerGameweekPointsRange(7, 8);
    const g7 = rows.find((r) => r.matchweek === 7)!;
    const g8 = rows.find((r) => r.matchweek === 8)!;
    expect(g7.actual_points).toBe(8);
    expect(g7.actual_contribution!.appearance).toBe(4);
    expect(g8.projected_points).toBeCloseTo(9);
    expect(g8.xpts_appearance).toBeCloseTo(3.6);
    expect(g8.start_probability).toBeCloseTo(0.9);
  });
});
