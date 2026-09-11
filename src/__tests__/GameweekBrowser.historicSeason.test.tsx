import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const HISTORIC_DAY = '2015-08-08';

describe('GameweekBrowser historic-season fallback', () => {
  it('falls back to the matches archive when fixtures are empty, and a date click shows that day\'s results', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', tier: null, country_id: 1, competition_type: 'league', scope: 'domestic' },
    ]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 2, label: '1516', start_year: 2015, end_year: 2016 }]);
    // No scheduled fixtures at all for this historic season.
    mockedApi.getFixtureCalendarIndex.mockResolvedValue([]);
    mockedApi.getMatchesCalendarIndex.mockResolvedValue([
      { kickoff_date: HISTORIC_DAY, matchweek: null },
    ]);
    mockedApi.getMatchesForDateAsFixtures.mockResolvedValue([
      {
        fixture_id: 900, league_id: 1, season_id: 2, home_team_id: 1, away_team_id: 2,
        home_team_name: 'Leicester', away_team_name: 'Sunderland',
        kickoff_date: HISTORIC_DAY, kickoff_time: null, matchweek: null, status: 'played',
        full_time_home_goals: 4, full_time_away_goals: 2,
      },
    ]);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?league=1&season=2']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    // Historic-mode explanatory note should appear (no matchweek data).
    await screen.findByText(/results archive/i);
    expect(mockedApi.getFixtureCalendarIndex).toHaveBeenCalledWith(1, 2);
    expect(mockedApi.getMatchesCalendarIndex).toHaveBeenCalledWith(1, 2);

    // Click the one day with data.
    const dayButton = await screen.findByRole('button', { name: /^8/ });
    expect(dayButton).not.toBeDisabled();
    await user.click(dayButton);

    await waitFor(() => expect(mockedApi.getMatchesForDateAsFixtures).toHaveBeenCalledWith(1, 2, HISTORIC_DAY));
    expect(mockedApi.getFixturesForDate).not.toHaveBeenCalled();
    await screen.findByText('Leicester');
    expect(screen.getByText('Sunderland')).toBeInTheDocument();
  });
});
