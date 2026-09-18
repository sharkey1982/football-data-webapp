import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataHealth from '../pages/DataHealth';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    getLeagueFitStatus: vi.fn(),
    getRecentMatchImportRuns: vi.fn(),
    getRecentFixtureRefreshRuns: vi.fn(),
    getRecentPipelineRuns: vi.fn(),
    getRecentFplIngestionRuns: vi.fn(),
    getPublicReadAudit: vi.fn(),
    getFitRunValidationChecks: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('DataHealth page', () => {
  it('shows each competition with its production and latest-attempted fit, and sorts on header click', async () => {
    mockedApi.getRecentMatchImportRuns.mockResolvedValue([
      {
        import_run_id: 1,
        started_at: '2026-09-14T06:00:00Z',
        finished_at: '2026-09-14T06:00:05Z',
        league_code: 'E0',
        rows_seen: 342,
        rows_upserted: 3,
        status: 'success',
        error_message: null,
      },
    ]);
    mockedApi.getRecentFixtureRefreshRuns.mockResolvedValue([]);
    mockedApi.getRecentPipelineRuns.mockResolvedValue([]);
    mockedApi.getRecentFplIngestionRuns.mockResolvedValue([]);
    mockedApi.getPublicReadAudit.mockResolvedValue([]);
    mockedApi.getLeagueFitStatus.mockResolvedValue([
      {
        league_id: 1,
        league_code: 'E0',
        league_name: 'Premier League',
        latest_attempted_fit_run_id: 13,
        latest_attempted_status: 'accepted',
        latest_attempted_fitted_at: '2026-09-14T05:38:32Z',
        latest_attempted_matches_used: 761,
        latest_attempted_converged: true,
        latest_attempted_rejection_reason: null,
        latest_attempted_validation_warnings: [],
        accepted_fit_run_id: 13,
        accepted_fitted_at: '2026-09-14T05:38:32Z',
        accepted_matches_used: 761,
        accepted_rho: -0.158,
        accepted_home_advantage: 0.164,
      },
      {
        league_id: 2,
        league_code: 'E1',
        league_name: 'Championship',
        latest_attempted_fit_run_id: 24,
        latest_attempted_status: 'rejected',
        latest_attempted_fitted_at: '2026-09-14T06:00:00Z',
        latest_attempted_matches_used: 40,
        latest_attempted_converged: true,
        latest_attempted_rejection_reason: 'a fitted parameter is pinned at the optimiser bound',
        latest_attempted_validation_warnings: [],
        accepted_fit_run_id: 14,
        accepted_fitted_at: '2026-09-14T05:38:38Z',
        accepted_matches_used: 1105,
        accepted_rho: -0.113,
        accepted_home_advantage: 0.199,
      },
    ]);

    render(<DataHealth />);

    await waitFor(() => expect(screen.getAllByText('E0').length).toBeGreaterThan(0));
    expect(screen.getAllByText('E1').length).toBeGreaterThan(0);
    // E1's latest attempt was rejected and differs from its accepted fit --
    // both the badge and the rejection reason should show.
    expect(screen.getByText('rejected')).toBeInTheDocument();
    expect(screen.getByText(/pinned at the optimiser bound/)).toBeInTheDocument();

    // Default sort is by competition code ascending -- E0 before E1.
    const fitTable = screen.getByTestId('fit-status-table');
    let nameCells = within(fitTable).getAllByText(/^(E0|E1)$/);
    expect(nameCells[0]).toHaveTextContent('E0');

    // Clicking the header should flip the default ascending sort to descending.
    const user = userEvent.setup();
    await user.click(screen.getByText('Competition'));

    await waitFor(() => {
      nameCells = within(fitTable).getAllByText(/^(E0|E1)$/);
      expect(nameCells[0]).toHaveTextContent('E1');
    });

    // The results-import run shows up in its own table, separate from the
    // fit-status table above.
    expect(screen.getByText('Results imports')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // rows_upserted
  });

  it('lazy-loads and shows the full validation checks for a row when expanded', async () => {
    mockedApi.getRecentMatchImportRuns.mockResolvedValue([]);
    mockedApi.getRecentFixtureRefreshRuns.mockResolvedValue([]);
    mockedApi.getRecentPipelineRuns.mockResolvedValue([]);
    mockedApi.getRecentFplIngestionRuns.mockResolvedValue([]);
    mockedApi.getPublicReadAudit.mockResolvedValue([]);
    mockedApi.getFitRunValidationChecks.mockResolvedValue({
      converged: { pass: true, optimizer_message: 'CONVERGENCE: NORM_OF_PROJECTED_GRADIENT_<=_PGTOL' },
      sufficient_observations: { pass: true, matches_used: 761, minimum: 50 },
    });
    mockedApi.getLeagueFitStatus.mockResolvedValue([
      {
        league_id: 1,
        league_code: 'E0',
        league_name: 'Premier League',
        latest_attempted_fit_run_id: 13,
        latest_attempted_status: 'accepted',
        latest_attempted_fitted_at: '2026-09-14T05:38:32Z',
        latest_attempted_matches_used: 761,
        latest_attempted_converged: true,
        latest_attempted_rejection_reason: null,
        latest_attempted_validation_warnings: [],
        accepted_fit_run_id: 13,
        accepted_fitted_at: '2026-09-14T05:38:32Z',
        accepted_matches_used: 761,
        accepted_rho: -0.158,
        accepted_home_advantage: 0.164,
      },
    ]);

    render(<DataHealth />);
    await waitFor(() => expect(screen.getAllByText('E0').length).toBeGreaterThan(0));

    expect(mockedApi.getFitRunValidationChecks).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Show checks/ }));

    await waitFor(() => expect(screen.getByText('Sufficient observations')).toBeInTheDocument());
    expect(mockedApi.getFitRunValidationChecks).toHaveBeenCalledWith(13);
    expect(screen.getByText(/matches_used=761/)).toBeInTheDocument();

    // Collapsing and re-expanding should not refetch -- it's cached.
    await user.click(screen.getByRole('button', { name: /Hide checks/ }));
    await user.click(screen.getByRole('button', { name: /Show checks/ }));
    expect(mockedApi.getFitRunValidationChecks).toHaveBeenCalledTimes(1);
  });

  it('flags a table granted to the public but blocked by a missing policy', async () => {
    mockedApi.getLeagueFitStatus.mockResolvedValue([]);
    mockedApi.getRecentMatchImportRuns.mockResolvedValue([]);
    mockedApi.getRecentFixtureRefreshRuns.mockResolvedValue([]);
    mockedApi.getRecentPipelineRuns.mockResolvedValue([]);
    mockedApi.getRecentFplIngestionRuns.mockResolvedValue([]);
    mockedApi.getPublicReadAudit.mockResolvedValue([
      // Granted but no policy -- the combination that means someone
      // INTENDED this readable and the policy was forgotten. This is the
      // exact shape that silently broke fpl_fixtures and match_odds.
      { table_name: 'something_broken', rls_enabled: true, has_select_policy: false, anon_has_select_grant: true, anon_can_read: false },
      // Deliberately internal: no grant, no policy. Must NOT be flagged.
      { table_name: 'internal_thing', rls_enabled: true, has_select_policy: false, anon_has_select_grant: false, anon_can_read: false },
      { table_name: 'fine', rls_enabled: true, has_select_policy: true, anon_has_select_grant: true, anon_can_read: true },
    ]);

    render(<DataHealth />);

    await waitFor(() => expect(screen.getByText('something_broken')).toBeInTheDocument());
    expect(screen.queryByText('internal_thing')).not.toBeInTheDocument();
    expect(screen.queryByText('fine')).not.toBeInTheDocument();
  });

  it('shows the Fantasy updates and Fantasy raw data sections, including a failed pipeline run\u2019s error', async () => {
    mockedApi.getRecentMatchImportRuns.mockResolvedValue([]);
    mockedApi.getRecentFixtureRefreshRuns.mockResolvedValue([]);
    mockedApi.getLeagueFitStatus.mockResolvedValue([]);
    mockedApi.getRecentPipelineRuns.mockResolvedValue([
      {
        run_id: 1,
        job_name: 'refresh_fpl_projections',
        started_at: '2026-09-17T07:00:00Z',
        finished_at: '2026-09-17T07:02:10Z',
        status: 'success',
        summary: 'GW5-7: 1974 projection row(s) across 30 fixture(s)',
        error_message: null,
      },
      {
        run_id: 2,
        job_name: 'simulate_fixture_bonus',
        started_at: '2026-09-17T07:03:00Z',
        finished_at: '2026-09-17T07:04:00Z',
        status: 'failed',
        summary: null,
        error_message: 'Fixture 512: connection reset',
      },
    ]);
    mockedApi.getRecentFplIngestionRuns.mockResolvedValue([
      {
        run_id: 1,
        started_at: '2026-09-17T18:17:00Z',
        completed_at: '2026-09-17T18:17:40Z',
        status: 'success',
        teams_upserted: 20,
        players_upserted: 680,
        gameweeks_upserted: 38,
        fixtures_upserted: 380,
        player_gameweeks_upserted: 0,
        error_message: null,
      },
    ]);

    render(<DataHealth />);

    await waitFor(() => expect(screen.getByText('Fantasy updates')).toBeInTheDocument());
    expect(screen.getByText('GW5-7: 1974 projection row(s) across 30 fixture(s)')).toBeInTheDocument();
    expect(screen.getByText('Fixture 512: connection reset')).toBeInTheDocument();

    expect(screen.getByText('Fantasy raw data')).toBeInTheDocument();
    expect(screen.getByText(/680 players/)).toBeInTheDocument();
  });
});
