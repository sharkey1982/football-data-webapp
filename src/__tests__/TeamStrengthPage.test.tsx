import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamStrengthPage from '../pages/TeamStrengthPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return { ...actual, getLeagues: vi.fn(), getTeamStrengthSummary: vi.fn(), saveTeamStrengthOverride: vi.fn() };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('TeamStrengthPage', () => {
  it('shows attack/defence, home advantage, and projected vs last-season goals', async () => {
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
          projected_position_mean: 1.5,
          projected_position_median: 1,
          projected_points_mean: 82.8,
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
          projected_position_mean: null,
          projected_position_median: null,
          projected_points_mean: null,
        },
      ],
      relegatedTeams: [{ team_id: 99, canonical_name: 'Ipswich' }],
    });

    render(<TeamStrengthPage />);

    await waitFor(() => expect(screen.getByText('Arsenal')).toBeInTheDocument());
    expect(screen.getByText('0.280')).toBeInTheDocument(); // home advantage
    expect(screen.getByText('68.3')).toBeInTheDocument(); // Arsenal projected GF
    expect(screen.getByText('91')).toBeInTheDocument(); // Arsenal last season GF
    expect(screen.getByText('1.5')).toBeInTheDocument(); // Arsenal projected final position (mean)
    expect(screen.getByText('1.5').title).toBe('Median: 1');
    // Newly promoted team with no last-season data shows a dash, not a fabricated number.
    expect(screen.getAllByText('\u2014').length).toBeGreaterThan(0);
    // Estimated rating is labelled as such.
    expect(screen.getByText('est.')).toBeInTheDocument();
    // Teams flagged as relegated (rated in a wider window but not in this
    // season's fixtures) are called out, not silently mixed into the table.
    expect(screen.getByText(/Relegated from 2526/)).toBeInTheDocument();
    expect(screen.getByText(/Ipswich/)).toBeInTheDocument();
  });

  it('shows a clear message when there is no accepted fit for the league', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League', competition_type: 'league' }]);
    mockedApi.getTeamStrengthSummary.mockResolvedValue({
      fitRun: null,
      currentSeasonLabel: '2627',
      lastSeasonLabel: '2526',
      rows: [],
      relegatedTeams: [],
    });

    render(<TeamStrengthPage />);

    await waitFor(() => expect(screen.getByText(/No accepted Dixon-Coles fit/)).toBeInTheDocument());
  });

  it('lets a team\u2019s attack/defence override be edited and saved, and shows it once saved', async () => {
    const baseSummary = {
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
          projected_position_mean: null,
          projected_position_median: null,
          projected_points_mean: null,
        },
      ],
      relegatedTeams: [],
    };

    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League', competition_type: 'league' }]);
    mockedApi.getTeamStrengthSummary.mockResolvedValueOnce(baseSummary).mockResolvedValueOnce({
      ...baseSummary,
      rows: [{ ...baseSummary.rows[0], attack_adjustment: 0.3, defence_adjustment: -0.1, override_note: 'signed a new striker' }],
    });
    mockedApi.saveTeamStrengthOverride.mockResolvedValue(undefined);

    render(<TeamStrengthPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Arsenal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Adjust' }));
    const attackInput = screen.getByLabelText('Attack adj.');
    const defenceInput = screen.getByLabelText('Defence adj.');
    await user.clear(attackInput);
    await user.type(attackInput, '0.3');
    await user.clear(defenceInput);
    await user.type(defenceInput, '-0.1');
    await user.type(screen.getByLabelText('Note'), 'signed a new striker');
    await user.click(screen.getByRole('button', { name: 'Save & apply' }));

    await waitFor(() => expect(mockedApi.saveTeamStrengthOverride).toHaveBeenCalledWith(1, 0.3, -0.1, 'signed a new striker'));
    // Once saved, the edit row closes and the new adjustment shows in the table.
    await waitFor(() => expect(screen.getByText(/\+0\.30 \/ -0\.10/)).toBeInTheDocument());
    expect(screen.queryByLabelText('Attack adj.')).not.toBeInTheDocument();
  });
});
