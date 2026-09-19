import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamStrengthPage from '../pages/TeamStrengthPage';
import * as api from '../lib/api';
import * as seasonApi from '../lib/fplSeasonApi';
import { triggerWorkflow } from '../lib/workflowTrigger';

// These tests exercise the ADMIN controls -- overrides, reset, workflow
// triggers -- which are now hidden from visitors because they're inert
// for them at the database level. Mocking an admin session is the
// honest way to test them; loosening the gate to make tests pass would
// put dead buttons back in front of every visitor.
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: true, session: null, loading: false }),
  useAuth: () => ({ isAdmin: true, session: null, loading: false }),
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
const mockedTriggerWorkflow = triggerWorkflow as unknown as ReturnType<typeof vi.fn>;

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

    render(<TeamStrengthPage adminMode />);

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

    render(<TeamStrengthPage adminMode />);

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
          override_updated_at: null,
          projected_position_mean: null,
          projected_position_median: null,
          projected_points_mean: null,
          position_simulated_at: null,
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

    render(<TeamStrengthPage adminMode />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Arsenal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Adjust' }));
    const attackInput = screen.getByLabelText('Target goals for /gm');
    const defenceInput = screen.getByLabelText('Target goals against /gm');
    // Pre-filled with the CURRENT effective value (exp(0.31)=1.36,
    // exp(-0.52)=0.59), not zero/empty -- editing starts from "here's
    // what it is now".
    expect(attackInput).toHaveValue(1.36);
    expect(defenceInput).toHaveValue(0.59);

    // Requested directly, after a raw +0.3 log-scale adjustment turned
    // out to be a 35% swing nobody intended: entering an absolute goals
    // target instead (here, roughly the same real-world change as that
    // old example: attack_strength+0.3, defence_strength-0.1) is the
    // actual fix, not just a clearer preview on top of the old input.
    await user.clear(attackInput);
    await user.type(attackInput, '1.84');
    await user.clear(defenceInput);
    await user.type(defenceInput, '0.66');
    await user.type(screen.getByLabelText('Note'), 'signed a new striker');

    // Live preview shows the change directly in goals terms, not a %.
    expect(screen.getByText(/Goals for: 1\.36 \u2192 1\.84\/gm, ranking 1 of 1/)).toBeInTheDocument();
    expect(screen.getByText(/Goals against: 0\.59 \u2192 0\.66\/gm, ranking 1 of 1/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save & apply' }));

    await waitFor(() => expect(mockedApi.saveTeamStrengthOverride).toHaveBeenCalled());
    // Rounding the goals input to 2dp means the recovered log-scale
    // adjustment isn't bit-exact -- assert closeness, not exact equality.
    const [teamId, attackAdj, defenceAdj, note] = mockedApi.saveTeamStrengthOverride.mock.calls[0];
    expect(teamId).toBe(1);
    expect(attackAdj).toBeCloseTo(0.2998, 3);
    expect(defenceAdj).toBeCloseTo(-0.1045, 3);
    expect(note).toBe('signed a new striker');
    // Once saved, the edit row closes and the new adjustment shows in the table.
    await waitFor(() => expect(screen.getByText(/\+0\.30 \/ -0\.10/)).toBeInTheDocument());
    expect(screen.queryByLabelText('Attack adj.')).not.toBeInTheDocument();
  });

  it('warns when a saved override postdates the last position simulation, and shows the effective (base + override) attack/defence value', async () => {
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
          team_id: 8,
          canonical_name: 'Hull',
          attack_strength: -0.301,
          defence_strength: -0.667,
          is_estimated: true,
          projected_gf: 42.5,
          projected_ga: 57.1,
          projected_fixtures_counted: 38,
          last_season_gf: null,
          last_season_ga: null,
          last_season_played: 0,
          this_season_actual_gf: null,
          this_season_actual_ga: null,
          this_season_actual_played: 0,
          attack_adjustment: 0.3,
          defence_adjustment: 0,
          override_note: 'promoted, strong start',
          override_updated_at: '2026-09-16T21:25:27.451Z',
          projected_position_mean: 19.5,
          projected_position_median: 20,
          projected_points_mean: 28.4,
          position_simulated_at: '2026-09-16T21:17:19.475Z', // before the override -- stale
        },
      ],
      relegatedTeams: [],
    });

    render(<TeamStrengthPage adminMode />);
    await waitFor(() => expect(screen.getByText('Hull')).toBeInTheDocument());

    // Page-level banner calls out the stale team by name.
    const banner = screen.getByText(/Proj\. Pos is out of date for:/);
    expect(banner.closest('p')?.textContent).toContain('Hull');

    // Effective goals-for value (base + override, converted from log scale) is
    // shown, not just the base value: exp(-0.301+0.3) = exp(-0.001) = 1.00.
    const matches = screen.getAllByText((_, el) => el?.tagName === 'SPAN' && el.className.includes('text-amber-700') && el.textContent === '\u2192 1.00');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('lets FPL projections be refreshed from the page, using the current default matchweek -- via a triggered workflow, not a direct RPC call', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League', competition_type: 'league' }]);
    mockedApi.getTeamStrengthSummary.mockResolvedValue({
      fitRun: null,
      currentSeasonLabel: '2627',
      lastSeasonLabel: '2526',
      rows: [],
      relegatedTeams: [],
    });
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(6);
    mockedTriggerWorkflow.mockResolvedValue(undefined);

    render(<TeamStrengthPage adminMode />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh FPL projections/ })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Refresh FPL projections/ }));

    // Confirmed directly this button had never actually worked as a
    // direct RPC call -- the call takes ~85s for a typical range, but
    // the roles the frontend connects as have a 3-8s statement_timeout,
    // so it was always killed mid-run. Now triggers a GitHub Actions
    // workflow (same pattern as the other two buttons on this page)
    // instead of calling refresh_fpl_projections_range directly.
    await waitFor(() => expect(mockedTriggerWorkflow).toHaveBeenCalledWith('refresh-fpl-projections', { from_matchweek: '6', to_matchweek: '15' }));
    expect(await screen.findByText(/Triggered for GW6\u201315.*3.5 minutes/)).toBeInTheDocument();
    // Makes clear this doesn't cover everything that might need refreshing.
    expect(screen.getByText(/does not re-run the bonus or finishing-position simulations/)).toBeInTheDocument();
  });

  it('triggers the final table simulation workflow with the correct season, and the bonus simulation workflow with the current default matchweek window', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League', competition_type: 'league' }]);
    mockedApi.getTeamStrengthSummary.mockResolvedValue({ fitRun: null, currentSeasonLabel: '2627', lastSeasonLabel: '2526', rows: [], relegatedTeams: [] });
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(6);
    mockedTriggerWorkflow.mockResolvedValue(undefined);

    render(<TeamStrengthPage adminMode />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('button', { name: /Re-run Proj\. Pos simulation/ })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Re-run Proj\. Pos simulation/ }));
    await waitFor(() => expect(mockedTriggerWorkflow).toHaveBeenCalledWith('simulate-final-table', { season_id: '13' }));
    expect(await screen.findByText(/Triggered.*1.2 minutes/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Re-run bonus simulation/ }));
    await waitFor(() => expect(mockedTriggerWorkflow).toHaveBeenCalledWith('simulate-fixture-bonus', { from_matchweek: '6', to_matchweek: '15' }));
  });

  it('shows the model\u2019s own value for comparison while editing, and lets an override be cleared entirely with Reset to model', async () => {
    const hullRow = {
      team_id: 8,
      canonical_name: 'Hull',
      attack_strength: -0.301,
      defence_strength: -0.667,
      is_estimated: true,
      projected_gf: 42.5,
      projected_ga: 57.1,
      projected_fixtures_counted: 38,
      last_season_gf: null,
      last_season_ga: null,
      last_season_played: 0,
      this_season_actual_gf: null,
      this_season_actual_ga: null,
      this_season_actual_played: 0,
      attack_adjustment: 0.3,
      defence_adjustment: 0,
      override_note: 'promoted, strong start',
      override_updated_at: '2026-09-16T21:25:27.451Z',
      projected_position_mean: 7.24,
      projected_position_median: 7,
      projected_points_mean: 57.99,
      position_simulated_at: '2026-09-17T04:00:24.955Z',
    };
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League', competition_type: 'league' }]);
    mockedApi.getTeamStrengthSummary
      .mockResolvedValueOnce({ fitRun: null, currentSeasonLabel: '2627', lastSeasonLabel: '2526', rows: [hullRow], relegatedTeams: [] })
      .mockResolvedValueOnce({
        fitRun: null,
        currentSeasonLabel: '2627',
        lastSeasonLabel: '2526',
        rows: [{ ...hullRow, attack_adjustment: 0, defence_adjustment: 0, override_note: null }],
        relegatedTeams: [],
      });
    mockedApi.saveTeamStrengthOverride.mockResolvedValue(undefined);

    render(<TeamStrengthPage adminMode />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Hull')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Adjust' }));
    // Model's own (un-overridden) value stays visible while editing:
    // exp(-0.301)=0.74, exp(0.667)=1.95.
    expect(screen.getByText(/Model says \(no override\):/)).toBeInTheDocument();
    expect(screen.getByText(/0\.74 goals for\/gm, 1\.95 goals against\/gm/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset to model' }));
    await waitFor(() => expect(mockedApi.saveTeamStrengthOverride).toHaveBeenCalledWith(8, 0, 0, null));
    // Edit row closes and the override indicator is gone once cleared.
    await waitFor(() => expect(screen.queryByLabelText('Target goals for /gm')).not.toBeInTheDocument());
  });

  it('never shows edit controls on the PUBLIC page, even to a signed-in admin', async () => {
    // The two nav entries (Football > Predict "Team Strength" and Admin
    // "Adjust Team Ratings") pointed at one route, so an admin saw the
    // editing UI on both and they looked like the same page. Editing now
    // requires the admin ROUTE as well as an admin session.
    render(<TeamStrengthPage />);

    await waitFor(() => expect(screen.getByText('Team Strength')).toBeInTheDocument());
    expect(screen.queryByText('Adjust Team Ratings')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset to model/ })).not.toBeInTheDocument();
  });
});
