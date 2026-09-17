import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MatchPreview from '../pages/MatchPreview';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getLeagues: vi.fn(),
    getLatestFitRun: vi.fn(),
    getTeamRatingsForFitRun: vi.fn(),
    getMatchesForTeam: vi.fn(),
    getHeadToHead: vi.fn(),
    getMatchResult: vi.fn(),
    getTeamById: vi.fn(),
    getTeamsInLeagueFixtures: vi.fn(),
    getMostRecentFixtureSeason: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('MatchPreview -- model-unavailable team name lookups', () => {
  it('fetches both missing teams\u2019 names concurrently rather than one after the other, requested as a performance fix', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League' }]);
    // No accepted fit for this league -- ratedTeams stays empty, so
    // BOTH home and away are "missing" and need their own getTeamById lookup.
    mockedApi.getLatestFitRun.mockResolvedValue(null);
    mockedApi.getTeamRatingsForFitRun.mockResolvedValue([]);
    mockedApi.getMostRecentFixtureSeason.mockResolvedValue({ season_id: 13, label: '2627' });
    mockedApi.getTeamsInLeagueFixtures.mockResolvedValue([
      { team_id: 10, canonical_name: 'Arsenal' },
      { team_id: 20, canonical_name: 'Chelsea' },
    ]);
    mockedApi.getMatchesForTeam.mockResolvedValue([]);
    mockedApi.getHeadToHead.mockResolvedValue([]);
    mockedApi.getMatchResult.mockResolvedValue(null);

    // Both getTeamById calls are in flight before either resolves --
    // proves they run concurrently, not sequentially (a sequential
    // implementation would only ever have at most one unresolved call at
    // a time).
    let inFlight = 0;
    let maxConcurrentInFlight = 0;
    mockedApi.getTeamById.mockImplementation((id: number) => {
      inFlight += 1;
      maxConcurrentInFlight = Math.max(maxConcurrentInFlight, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          resolve(id === 10 ? { team_id: 10, canonical_name: 'Arsenal' } : { team_id: 20, canonical_name: 'Chelsea' });
        }, 10);
      });
    });

    render(
      <MemoryRouter initialEntries={['/preview?league=1&home=10&away=20']}>
        <MatchPreview />
      </MemoryRouter>
    );

    await waitFor(() => expect(mockedApi.getTeamById).toHaveBeenCalledTimes(2));
    expect(mockedApi.getTeamById).toHaveBeenCalledWith(10);
    expect(mockedApi.getTeamById).toHaveBeenCalledWith(20);
    await waitFor(() => expect(maxConcurrentInFlight).toBe(2));

    // Both names show up in the resulting "model unavailable" state
    // (appears in several places on the page -- header, form summary,
    // etc -- so just confirm at least one instance of each).
    await waitFor(() => expect(screen.getAllByText('Arsenal', { exact: false }).length).toBeGreaterThan(0));
    expect(screen.getAllByText('Chelsea', { exact: false }).length).toBeGreaterThan(0);
  });
});
