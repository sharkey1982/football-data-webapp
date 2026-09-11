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
    getFixturesForSeason: vi.fn(),
    getMatchesForSeasonAsFixtures: vi.fn(),
    getFixturesForTeam: vi.fn(),
    getMatchesForTeamAsFixtures: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

// Dates computed relative to the real current date (a few days each side,
// safely within the same month for a deterministic calendar-click test)
// rather than faking the system clock, which fights with
// requestAnimationFrame and testing-library's async polling.
function isoDaysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
const PAST_DATE = isoDaysFromToday(-2);
const PAST_DAY = Number(PAST_DATE.slice(8, 10));
const FUTURE_DATE = isoDaysFromToday(3);

function setupMocks() {
  mockedApi.getLeagues.mockResolvedValue([
    { league_id: 1, code: 'E0', name: 'Premier League', tier: null, country_id: 1, competition_type: 'league', scope: 'domestic' },
  ]);
  mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
  mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
  mockedApi.getFixturesForSeason.mockResolvedValue([
    {
      fixture_id: 1, league_id: 1, season_id: 13, home_team_id: 1, away_team_id: 2,
      home_team_name: 'Arsenal', away_team_name: 'Chelsea',
      kickoff_date: PAST_DATE, kickoff_time: '15:00', matchweek: 1, status: 'played',
      full_time_home_goals: 2, full_time_away_goals: 1,
    },
    {
      fixture_id: 2, league_id: 1, season_id: 13, home_team_id: 3, away_team_id: 4,
      home_team_name: 'Liverpool', away_team_name: 'Everton',
      kickoff_date: FUTURE_DATE, kickoff_time: '15:00', matchweek: 2, status: 'scheduled',
    },
  ]);
}

describe('GameweekBrowser matchweek grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands the current/nearest matchweek by default, keeps others collapsed, and toggles on click', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?league=1&season=13']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    // Matchweek 2 (upcoming, closest to "today") is expanded by default.
    await screen.findByText('Liverpool');
    expect(screen.getByText('Everton')).toBeInTheDocument();
    // Matchweek 1 (past) starts collapsed.
    expect(screen.queryByText('Arsenal')).not.toBeInTheDocument();
    expect(screen.getByText('Matchweek 1')).toBeInTheDocument();

    // Clicking its header expands it.
    await user.click(screen.getByText('Matchweek 1'));
    await screen.findByText('Arsenal');
    expect(screen.getByText('Chelsea')).toBeInTheDocument();

    // Clicking again collapses it.
    await user.click(screen.getByText('Matchweek 1'));
    await waitFor(() => expect(screen.queryByText('Arsenal')).not.toBeInTheDocument());
  });

  it('clicking a calendar day expands and reveals that date\'s matchweek', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?league=1&season=13']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    await screen.findByText('Liverpool');
    expect(screen.queryByText('Arsenal')).not.toBeInTheDocument();

    // Both dates fall in the current real-world month (calendar's default
    // view), so the past date's day button is clickable without paging.
    const dayButton = await screen.findByRole('button', { name: new RegExp(`^${PAST_DAY}`) });
    expect(dayButton).not.toBeDisabled();
    await user.click(dayButton);

    // Matchweek 1 is now revealed -- expanded by the click, not a new
    // fetch (the whole season was already loaded in one go).
    await screen.findByText('Arsenal');
    expect(mockedApi.getFixturesForSeason).toHaveBeenCalledTimes(1);
  });
});
