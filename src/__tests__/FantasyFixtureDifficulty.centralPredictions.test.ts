import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

function makeBuilder(rows: any[]) {
  let filtered = rows;
  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => {
      filtered = filtered.filter((r: any) => r[col] === val);
      return api;
    },
    neq: (col: string, val: any) => {
      filtered = filtered.filter((r: any) => r[col] !== val);
      return api;
    },
    order: () => api,
    limit: () => api,
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: filtered, error: null }),
  };
  return api;
}

describe('getFantasyFixtureDifficulty', () => {
  it('uses the central, stored predicted_home_goals/predicted_away_goals -- never recomputes its own xG', async () => {
    const { supabase } = await import('../lib/supabase');
    const tables: Record<string, any[]> = {
      model_fit_runs: [{ fit_run_id: 1, league_id: 1, status: 'accepted', fitted_at: '2026-09-15', rho: -0.15, home_advantage: 0.3 }],
      team_ratings: [
        { team_id: 1, fit_run_id: 1, attack_strength: 0.9, defence_strength: -0.2, is_estimated: false, estimation_note: null, team: { canonical_name: 'Man City' } },
        { team_id: 2, fit_run_id: 1, attack_strength: -0.6, defence_strength: 0.5, is_estimated: false, estimation_note: null, team: { canonical_name: 'Sunderland' } },
      ],
      fixtures: [
        {
          fixture_id: 41, kickoff_date: '2026-09-20', matchweek: 5, status: 'scheduled', season_id: 13, league_id: 1,
          home_team_id: 1, away_team_id: 2,
          // Deliberately different from what the old plain
          // exp(homeAdvantage + attack - defence) formula would produce
          // from the ratings above -- if the function were still
          // recomputing xG itself, these exact numbers wouldn't appear.
          predicted_home_goals: 1.6715, predicted_away_goals: 1.4963,
          home_team: { canonical_name: 'Man City' }, away_team: { canonical_name: 'Sunderland' },
        },
      ],
    };
    (supabase.from as any).mockImplementation((table: string) => makeBuilder(tables[table] ?? []));

    const { getFantasyFixtureDifficulty } = await import('../lib/api');
    const result = await getFantasyFixtureDifficulty(1, 13);

    const cityFixture = result.teams.find((t) => t.team_name === 'Man City')!.fixtures[0];
    expect(cityFixture.expected_goals_for).toBe(1.6715);
    expect(cityFixture.expected_goals_against).toBe(1.4963);
    // Clean sheet probability must match the exact same formula used
    // elsewhere in the FPL projection system: plain Poisson P(0) from the
    // opponent's expected goals, no Dixon-Coles tau correction.
    expect(cityFixture.clean_sheet_probability).toBeCloseTo(Math.exp(-1.4963), 10);

    const sunderlandFixture = result.teams.find((t) => t.team_name === 'Sunderland')!.fixtures[0];
    expect(sunderlandFixture.expected_goals_for).toBe(1.4963);
    expect(sunderlandFixture.expected_goals_against).toBe(1.6715);
    expect(sunderlandFixture.clean_sheet_probability).toBeCloseTo(Math.exp(-1.6715), 10);
  });

  it('skips a fixture with no predicted goals yet, rather than showing a stale or invented number', async () => {
    const { supabase } = await import('../lib/supabase');
    const tables: Record<string, any[]> = {
      model_fit_runs: [{ fit_run_id: 1, league_id: 1, status: 'accepted', fitted_at: '2026-09-15', rho: -0.15, home_advantage: 0.3 }],
      team_ratings: [
        { team_id: 1, fit_run_id: 1, attack_strength: 0.9, defence_strength: -0.2, is_estimated: false, estimation_note: null, team: { canonical_name: 'Man City' } },
        { team_id: 2, fit_run_id: 1, attack_strength: -0.6, defence_strength: 0.5, is_estimated: false, estimation_note: null, team: { canonical_name: 'Sunderland' } },
      ],
      fixtures: [
        {
          fixture_id: 41, kickoff_date: '2026-09-20', matchweek: 5, status: 'scheduled', season_id: 13, league_id: 1,
          home_team_id: 1, away_team_id: 2,
          predicted_home_goals: null, predicted_away_goals: null,
          home_team: { canonical_name: 'Man City' }, away_team: { canonical_name: 'Sunderland' },
        },
      ],
    };
    (supabase.from as any).mockImplementation((table: string) => makeBuilder(tables[table] ?? []));

    const { getFantasyFixtureDifficulty } = await import('../lib/api');
    const result = await getFantasyFixtureDifficulty(1, 13);

    expect(result.teams.find((t) => t.team_name === 'Man City')).toBeUndefined();
  });
});
