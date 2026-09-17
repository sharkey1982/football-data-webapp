import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FixtureChangeBanner } from '../components/FixtureChangeBanner';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return { ...actual, getRecentEplFixtureChanges: vi.fn() };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('FixtureChangeBanner', () => {
  it('shows nothing while there are no recent changes', async () => {
    mockedApi.getRecentEplFixtureChanges.mockResolvedValue([]);
    const { container } = render(<FixtureChangeBanner />);
    await waitFor(() => expect(mockedApi.getRecentEplFixtureChanges).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a recent kickoff change with the old and new dates', async () => {
    mockedApi.getRecentEplFixtureChanges.mockResolvedValue([
      {
        change_id: 1,
        home_team_name: 'Arsenal',
        away_team_name: 'Chelsea',
        old_kickoff_date: '2026-09-20',
        new_kickoff_date: '2026-09-21',
        detected_at: '2026-09-17T10:00:00Z',
      },
    ]);
    render(<FixtureChangeBanner />);
    await waitFor(() => expect(screen.getByText(/Arsenal vs Chelsea/)).toBeInTheDocument());
    expect(screen.getByText(/moved from/)).toBeInTheDocument();
  });

  it('lets a person dismiss a change, and it stays hidden', async () => {
    mockedApi.getRecentEplFixtureChanges.mockResolvedValue([
      {
        change_id: 1,
        home_team_name: 'Arsenal',
        away_team_name: 'Chelsea',
        old_kickoff_date: '2026-09-20',
        new_kickoff_date: '2026-09-21',
        detected_at: '2026-09-17T10:00:00Z',
      },
    ]);
    render(<FixtureChangeBanner />);
    await waitFor(() => expect(screen.getByText(/Arsenal vs Chelsea/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Arsenal vs Chelsea/)).not.toBeInTheDocument();
  });

  it('shows nothing at all if the fetch fails, rather than an error state', async () => {
    mockedApi.getRecentEplFixtureChanges.mockRejectedValue(new Error('network error'));
    const { container } = render(<FixtureChangeBanner />);
    await waitFor(() => expect(mockedApi.getRecentEplFixtureChanges).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
