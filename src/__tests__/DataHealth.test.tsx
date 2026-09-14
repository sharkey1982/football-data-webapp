import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataHealth from '../pages/DataHealth';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    getLeagueFitStatus: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('DataHealth page', () => {
  it('shows each competition with its production and latest-attempted fit, and sorts on header click', async () => {
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

    await waitFor(() => expect(screen.getByText('E0')).toBeInTheDocument());
    expect(screen.getByText('E1')).toBeInTheDocument();
    // E1's latest attempt was rejected and differs from its accepted fit --
    // both the badge and the rejection reason should show.
    expect(screen.getByText('rejected')).toBeInTheDocument();
    expect(screen.getByText(/pinned at the optimiser bound/)).toBeInTheDocument();

    // Default sort is by competition code ascending -- E0 before E1.
    let nameCells = screen.getAllByText(/^(E0|E1)$/);
    expect(nameCells[0]).toHaveTextContent('E0');

    // Clicking the header should flip the default ascending sort to descending.
    const user = userEvent.setup();
    await user.click(screen.getByText('Competition'));

    await waitFor(() => {
      nameCells = screen.getAllByText(/^(E0|E1)$/);
      expect(nameCells[0]).toHaveTextContent('E1');
    });
  });
});
