import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FitFreshnessBanner } from '../components/FitFreshnessBanner';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    getLeagueFitStatusFor: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function healthyStatus(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    league_id: 1,
    league_code: 'E0',
    league_name: 'Premier League',
    latest_attempted_fit_run_id: 13,
    latest_attempted_status: 'accepted',
    latest_attempted_fitted_at: new Date().toISOString(),
    latest_attempted_matches_used: 761,
    latest_attempted_converged: true,
    latest_attempted_rejection_reason: null,
    latest_attempted_validation_warnings: [],
    accepted_fit_run_id: 13,
    accepted_fitted_at: new Date().toISOString(),
    accepted_matches_used: 761,
    accepted_rho: -0.158,
    accepted_home_advantage: 0.164,
    ...overrides,
  };
}

describe('FitFreshnessBanner', () => {
  it('renders nothing when there is no league selected', () => {
    const { container } = render(<FitFreshnessBanner leagueId={null} fitRun={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the fit is recent and the latest attempt matches production', async () => {
    mockedApi.getLeagueFitStatusFor.mockResolvedValue(healthyStatus());
    const { container } = render(
      <FitFreshnessBanner leagueId={1} fitRun={{ fit_run_id: 13, fitted_at: new Date().toISOString() } as any} />
    );
    await waitFor(() => expect(mockedApi.getLeagueFitStatusFor).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('warns when the accepted fit is stale', async () => {
    mockedApi.getLeagueFitStatusFor.mockResolvedValue(healthyStatus());
    const oldFittedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    render(<FitFreshnessBanner leagueId={1} fitRun={{ fit_run_id: 13, fitted_at: oldFittedAt } as any} />);
    await waitFor(() => expect(screen.getByText(/haven't been refreshed/)).toBeInTheDocument());
  });

  it('warns when the latest refit attempt was rejected', async () => {
    mockedApi.getLeagueFitStatusFor.mockResolvedValue(
      healthyStatus({
        latest_attempted_fit_run_id: 24,
        latest_attempted_status: 'rejected',
        latest_attempted_rejection_reason: 'a fitted parameter is pinned at the optimiser bound',
      })
    );
    render(<FitFreshnessBanner leagueId={1} fitRun={{ fit_run_id: 13, fitted_at: new Date().toISOString() } as any} />);
    await waitFor(() => expect(screen.getByText(/most recent refit attempt was rejected/)).toBeInTheDocument());
    expect(screen.getByText(/pinned at the optimiser bound/)).toBeInTheDocument();
  });

  it('shows the harder error when no accepted fit exists at all', async () => {
    mockedApi.getLeagueFitStatusFor.mockResolvedValue(null);
    render(<FitFreshnessBanner leagueId={1} fitRun={null} />);
    expect(screen.getByText(/No validated model fit exists yet/)).toBeInTheDocument();
    await waitFor(() => expect(mockedApi.getLeagueFitStatusFor).toHaveBeenCalled());
  });
});
