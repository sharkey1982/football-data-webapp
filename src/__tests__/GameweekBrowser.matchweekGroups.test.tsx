import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

// Dates computed relative to the real current date rather than faking the
// system clock (which fights with requestAnimationFrame and
// testing-library's async polling). Chosen to be robust regardless of
// where in its month "today" falls:
//   - MW1 is dated exactly today -- so it's the one the fixture list
//     defaults to showing, since the calendar defaults its date
//     selection to today.
//   - MW2 is 95 days out -- more than the longest possible span of the
//     calendar's default two-month window from any starting day, so
//     it's never inside that window by coincidence.
function isoDaysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
const MW1_DATE = isoDaysFromToday(0);
const MW2_DATE = isoDaysFromToday(95);

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
      kickoff_date: MW1_DATE, kickoff_time: '15:00', matchweek: 1, status: 'played',
      full_time_home_goals: 2, full_time_away_goals: 1,
    },
    {
      fixture_id: 2, league_id: 1, season_id: 13, home_team_id: 3, away_team_id: 4,
      home_team_name: 'Liverpool', away_team_name: 'Everton',
      kickoff_date: MW2_DATE, kickoff_time: '15:00', matchweek: 2, status: 'scheduled',
    },
  ]);
}

describe('GameweekBrowser date-selection-filters-list behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to today selected, showing only fixtures on that date', async () => {
    setupMocks();
    render(
      <MemoryRouter initialEntries={['/?league=1&season=13']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    // MW1 (today) is the default selection, so it's the only fixture shown.
    await screen.findByText('Arsenal');
    expect(screen.getByText('Chelsea')).toBeInTheDocument();
    // MW2 (95 days out, not selected) is filtered out of the list
    // entirely -- not merely collapsed, since it doesn't match today.
    expect(screen.queryByText('Liverpool')).not.toBeInTheDocument();
    expect(screen.queryByText('Matchweek 2')).not.toBeInTheDocument();
  });

  it('paging the calendar to a new month does not change the list -- only the date selection does', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?league=1&season=13']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    await screen.findByText('Arsenal');

    // Paging the calendar forward is just browsing -- with today still
    // the selected date, today's fixture stays in the list regardless
    // of which months the calendar itself is showing.
    await user.click(screen.getByLabelText('Next month'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Arsenal')).toBeInTheDocument();
    expect(screen.queryByText('Liverpool')).not.toBeInTheDocument();
    // No extra fetch -- this is all derived client-side from the one
    // season-wide fetch already in memory.
    expect(mockedApi.getFixturesForSeason).toHaveBeenCalledTimes(1);
  });

  it("clearing the date selection reveals every matchweek, collapsed by the calendar's two-month window as before", async () => {
    setupMocks();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?league=1&season=13']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    await screen.findByText('Arsenal');
    await user.click(screen.getByText('Clear'));

    // With nothing selected, the list falls back to showing every
    // matchweek with a fixture in the calendar's current two-month
    // window (Matchweek 1) plus every other matchweek's section header,
    // collapsed -- Matchweek 2 is 95 days out so starts closed.
    await screen.findByText('Matchweek 2');
    expect(screen.queryByText('Liverpool')).not.toBeInTheDocument();
    await user.click(screen.getByText('Matchweek 2'));
    await screen.findByText('Liverpool');
  });
});
