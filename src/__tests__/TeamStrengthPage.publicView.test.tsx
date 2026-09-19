import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TeamStrengthPage from '../pages/TeamStrengthPage';
import * as api from '../lib/api';
import * as seasonApi from '../lib/fplSeasonApi';

// The mirror of TeamStrengthPage.test.tsx, which mocks an ADMIN. This
// one is a visitor and asserts the write controls are absent. Without
// it only the admin half of the split would be covered, and the gate
// could stop working without any test noticing.
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: false, session: null, loading: false }),
  useAuth: () => ({ isAdmin: false, session: null, loading: false }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return { ...actual, getLeagues: vi.fn(), getTeamStrengthSummary: vi.fn(), saveTeamStrengthOverride: vi.fn() };
});
vi.mock('../lib/fplSeasonApi', async () => {
  const actual = await vi.importActual<typeof seasonApi>('../lib/fplSeasonApi');
  return { ...actual, getDefaultMatchweek: vi.fn() };
});
vi.mock('../lib/workflowTrigger', () => ({ triggerWorkflow: vi.fn() }));

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedSeasonApi = seasonApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('TeamStrengthPage as a visitor', () => {
  it('shows the ratings but none of the write controls', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League', competition_type: 'league' }]);
    mockedApi.getTeamStrengthSummary.mockResolvedValue({
      fitRun: {
        fit_run_id: 25,
        league_id: 1,
        window_start_date: '2024-09-01',
        window_end_date: '2026-09-14',
        rho: -0.08,
        home_advantage: 0.28,
        decay_half_life_days: 180,
        log_likelihood: -500,
        converged: true,
        matches_used: 320,
        fitted_at: '2026-09-14T12:00:00Z',
        status: 'accepted',
        rejection_reason: null,
        validation_warnings: null,
        validation_checks: null,
      },
      currentSeasonLabel: '2627',
      lastSeasonLabel: '2526',
      rows: [
        {
          team_id: 1,
          canonical_name: 'Arsenal',
          attack_strength: 0.31,
          defence_strength: 0.52,
          is_estimated: false,
          projected_gf: 68.3,
          projected_ga: 40.1,
          projected_fixtures_counted: 38,
          last_season_gf: 91,
          last_season_ga: 41,
          last_season_played: 38,
          this_season_actual_gf: null,
          this_season_actual_ga: null,
          this_season_actual_played: 0,
          attack_adjustment: 0,
          defence_adjustment: 0,
          override_note: null,
          override_updated_at: null,
          projected_position_mean: 1.5,
          projected_position_median: 1,
          projected_points_mean: 82.8,
          position_simulated_at: null,
        },
        {
          team_id: 2,
          canonical_name: 'Sunderland',
          attack_strength: -0.4,
          defence_strength: -0.3,
          is_estimated: true,
          projected_gf: 41.2,
          projected_ga: 62.5,
          projected_fixtures_counted: 38,
          last_season_gf: null,
          last_season_ga: null,
          last_season_played: 0,
          this_season_actual_gf: null,
          this_season_actual_ga: null,
          this_season_actual_played: 0,
          attack_adjustment: 0,
          defence_adjustment: 0,
          override_note: null,
          override_updated_at: null,
          projected_position_mean: null,
          projected_position_median: null,
          projected_points_mean: null,
          position_simulated_at: null,
        },
      ],
      relegatedTeams: [{ team_id: 99, canonical_name: 'Ipswich' }],
    });

    render(<TeamStrengthPage />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Team Strength' })).toBeInTheDocument());

    // Public identity, not the admin one.
    expect(screen.queryByRole('heading', { name: 'Adjust Team Ratings' })).not.toBeInTheDocument();

    // Every write affordance absent. These are refused by RLS anyway, so
    // rendering them promised something the page couldn't deliver.
    expect(screen.queryByRole('button', { name: 'Adjust' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Re-run Proj\. Pos simulation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Re-run bonus simulation/ })).not.toBeInTheDocument();
  });
});
