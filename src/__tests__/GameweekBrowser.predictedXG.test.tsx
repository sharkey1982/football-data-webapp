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
    getFixturesForSeason: vi.fn(),
    getMatchesForSeasonAsFixtures: vi.fn(),
    getFixturesForTeam: vi.fn(),
    getMatchesForTeamAsFixtures: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const TODAY = new Date().toISOString().slice(0, 10);

describe('GameweekBrowser predicted expected-goals display', () => {
  it('shows the stored xG prediction for a scheduled fixture, the real score alongside a frozen pre-match xG for a played one, and plain "vs" for neither', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', tier: null, country_id: 1, competition_type: 'league', scope: 'domestic' },
    ]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
    mockedApi.getFixturesForSeason.mockResolvedValue([
      {
        fixture_id: 1, league_id: 1, season_id: 13, home_team_id: 1, away_team_id: 2,
        home_team_name: 'Arsenal', away_team_name: 'Chelsea',
        kickoff_date: TODAY, kickoff_time: '15:00', matchweek: 1, status: 'scheduled',
        predicted_home_goals: 1.8, predicted_away_goals: 1.2,
      },
      {
        fixture_id: 2, league_id: 1, season_id: 13, home_team_id: 3, away_team_id: 4,
        home_team_name: 'Liverpool', away_team_name: 'Everton',
        kickoff_date: TODAY, kickoff_time: '15:00', matchweek: 1, status: 'played',
        full_time_home_goals: 3, full_time_away_goals: 1,
        // A frozen pre-match prediction (backfill_historic_fixture_predictions) --
        // the real score must still take visual priority, but this shows too.
        predicted_home_goals: 2.1, predicted_away_goals: 0.9,
      },
      {
        fixture_id: 3, league_id: 1, season_id: 13, home_team_id: 5, away_team_id: 6,
        home_team_name: 'Fulham', away_team_name: 'Brentford',
        kickoff_date: TODAY, kickoff_time: '15:00', matchweek: 1, status: 'scheduled',
        predicted_home_goals: null, predicted_away_goals: null,
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/?league=1&season=13']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    await screen.findByText('Arsenal');

    // Scheduled fixture WITH a prediction shows xG estimate, not a score.
    expect(screen.getByText('1.8\u20131.2')).toBeInTheDocument();
    expect(screen.getByText('xG est.')).toBeInTheDocument();

    // Played fixture shows the real score AND its frozen pre-match xG.
    const scoreChip = document.querySelector('.scoreline');
    expect(scoreChip?.textContent).toBe('3\u20131');
    expect(screen.getByText('xG 2.1\u20130.9')).toBeInTheDocument();

    // Scheduled fixture with no prediction stored falls back to plain "vs".
    expect(screen.getByText('vs')).toBeInTheDocument();
  });
});
