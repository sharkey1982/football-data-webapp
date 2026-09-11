import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const playedMatch = {
  match_id: 555,
  league_id: 1,
  season_id: 13,
  home_team_id: 10,
  away_team_id: 20,
  home_team_name: 'Arsenal',
  away_team_name: 'Chelsea',
  match_date: '2026-09-05',
  kickoff_time: '15:00:00',
  referee: 'M. Oliver',
  full_time_home_goals: 3,
  full_time_away_goals: 1,
  full_time_result: 'H',
  half_time_home_goals: 1,
  half_time_away_goals: 0,
  half_time_result: 'H',
  home_shots: 14,
  away_shots: 8,
  home_shots_on_target: 6,
  away_shots_on_target: 3,
  home_corners: 7,
  away_corners: 2,
  home_fouls: 9,
  away_fouls: 11,
  home_yellow_cards: 1,
  away_yellow_cards: 2,
  home_red_cards: 0,
  away_red_cards: 0,
  league_code: 'E0',
  league_name: 'Premier League',
  season_label: '2627',
};

describe('MatchPreview result banner', () => {
  it('shows the Full-Time Result banner when the linked fixture has an exact match result', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League' }]);
    mockedApi.getLatestFitRun.mockResolvedValue(null); // model not required for this test
    mockedApi.getTeamRatingsForFitRun.mockResolvedValue([]);
    mockedApi.getMostRecentFixtureSeason.mockResolvedValue({ season_id: 13, label: '2627' });
    mockedApi.getTeamsInLeagueFixtures.mockResolvedValue([
      { team_id: 10, canonical_name: 'Arsenal' },
      { team_id: 20, canonical_name: 'Chelsea' },
    ]);
    mockedApi.getMatchesForTeam.mockResolvedValue([]);
    mockedApi.getHeadToHead.mockResolvedValue([playedMatch]);
    mockedApi.getTeamById.mockImplementation((id: number) =>
      Promise.resolve(id === 10 ? { team_id: 10, canonical_name: 'Arsenal' } : { team_id: 20, canonical_name: 'Chelsea' })
    );
    mockedApi.getMatchResult.mockResolvedValue(playedMatch);

    render(
      <MemoryRouter initialEntries={['/preview?league=1&home=10&away=20&season=13']}>
        <MatchPreview />
      </MemoryRouter>
    );

    await screen.findByText('Full-Time Result', { exact: false });
    expect(mockedApi.getMatchResult).toHaveBeenCalledWith(1, 13, 10, 20);
    expect(screen.getByText('M. Oliver', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('does not show the result banner when there is no season param (manual comparison)', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League' }]);
    mockedApi.getLatestFitRun.mockResolvedValue(null);
    mockedApi.getTeamRatingsForFitRun.mockResolvedValue([]);
    mockedApi.getMostRecentFixtureSeason.mockResolvedValue({ season_id: 13, label: '2627' });
    mockedApi.getTeamsInLeagueFixtures.mockResolvedValue([
      { team_id: 10, canonical_name: 'Arsenal' },
      { team_id: 20, canonical_name: 'Chelsea' },
    ]);
    mockedApi.getMatchesForTeam.mockResolvedValue([]);
    mockedApi.getHeadToHead.mockResolvedValue([]);
    mockedApi.getTeamById.mockImplementation((id: number) =>
      Promise.resolve(id === 10 ? { team_id: 10, canonical_name: 'Arsenal' } : { team_id: 20, canonical_name: 'Chelsea' })
    );
    mockedApi.getMatchResult.mockClear();

    render(
      <MemoryRouter initialEntries={['/preview?league=1&home=10&away=20']}>
        <MatchPreview />
      </MemoryRouter>
    );

    await screen.findByText('Build match preview');
    expect(mockedApi.getMatchResult).not.toHaveBeenCalled();
    expect(screen.queryByText('Full-Time Result', { exact: false })).not.toBeInTheDocument();
  });
});
