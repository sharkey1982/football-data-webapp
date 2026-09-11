import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GameweekBrowser from '../pages/GameweekBrowser';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  return {
    getLeagues: vi.fn(),
    getCountries: vi.fn(),
    getSeasons: vi.fn(),
    getTeams: vi.fn(),
    getTeamById: vi.fn(),
    getFixturesForMatchweek: vi.fn(),
    getFixtureCalendarIndex: vi.fn(),
    getMatchesCalendarIndex: vi.fn(),
    getFixturesForDate: vi.fn(),
    getMatchesForDateAsFixtures: vi.fn(),
    getFixturesForTeam: vi.fn(),
    getMatchesForTeamAsFixtures: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('GameweekBrowser team-view historic fallback', () => {
  it('falls back to the matches archive when fixtures has no rows for this team+season', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', tier: null, country_id: 1, competition_type: 'league', scope: 'domestic' },
    ]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 12, label: '2526', start_year: 2025, end_year: 2026 }]);
    mockedApi.getTeamById.mockResolvedValue({ team_id: 1, canonical_name: 'Arsenal' });
    // fixtures has nothing for this fully historic season...
    mockedApi.getFixturesForTeam.mockResolvedValue([]);
    // ...but matches does.
    mockedApi.getMatchesForTeamAsFixtures.mockResolvedValue([
      {
        fixture_id: 500, league_id: 1, season_id: 12, home_team_id: 1, away_team_id: 2,
        home_team_name: 'Arsenal', away_team_name: 'Chelsea',
        kickoff_date: '2025-09-06', kickoff_time: null, matchweek: null, status: 'played',
        league_code: 'E0', league_name: 'Premier League', competition_type: 'league',
        full_time_home_goals: 2, full_time_away_goals: 1,
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/?view=team&team=1&season=12']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    await screen.findByText('Chelsea');
    expect(mockedApi.getFixturesForTeam).toHaveBeenCalledWith(1, 12);
    expect(mockedApi.getMatchesForTeamAsFixtures).toHaveBeenCalledWith(1, 12);
    await screen.findByText(/results archive/i);
  });
});
