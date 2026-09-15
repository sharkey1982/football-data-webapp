import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TeamStrengthPage from '../pages/TeamStrengthPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return { ...actual, getLeagues: vi.fn(), getTeamStrengthSummary: vi.fn() };
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
        },
      ],
      relegatedTeams: [{ team_id: 99, canonical_name: 'Ipswich' }],
    });

    render(<TeamStrengthPage />);

    await waitFor(() => expect(screen.getByText('Arsenal')).toBeInTheDocument());
    expect(screen.getByText('0.280')).toBeInTheDocument(); // home advantage
    expect(screen.getByText('68.3')).toBeInTheDocument(); // Arsenal projected GF
    expect(screen.getByText('91')).toBeInTheDocument(); // Arsenal last season GF
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
});
