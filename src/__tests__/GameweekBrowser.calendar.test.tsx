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
    getFixturesForDate: vi.fn(),
    getFixturesForTeam: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, '0');
const DAY_A = `${y}-${m}-05`;
const DAY_B = `${y}-${m}-12`;

function setupDivisionMocks() {
  mockedApi.getLeagues.mockResolvedValue([
    { league_id: 1, code: 'E0', name: 'Premier League', tier: null, country_id: 1, competition_type: 'league', scope: 'domestic' },
  ]);
  mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
  mockedApi.getSeasons.mockResolvedValue([{ season_id: 1, label: '2627', start_year: 2026, end_year: 2027 }]);
  mockedApi.getFixtureCalendarIndex.mockResolvedValue([
    { kickoff_date: DAY_A, matchweek: 1 },
    { kickoff_date: DAY_B, matchweek: 2 },
  ]);
  mockedApi.getFixturesForMatchweek.mockResolvedValue([
    {
      fixture_id: 1, league_id: 1, season_id: 1, home_team_id: 1, away_team_id: 2,
      home_team_name: 'Arsenal', away_team_name: 'Chelsea',
      kickoff_date: DAY_A, kickoff_time: '15:00', matchweek: 1, status: 'scheduled',
    },
  ]);
  mockedApi.getFixturesForDate.mockResolvedValue([
    {
      fixture_id: 99, league_id: 1, season_id: 1, home_team_id: 3, away_team_id: 4,
      home_team_name: 'Liverpool', away_team_name: 'Everton',
      kickoff_date: DAY_B, kickoff_time: '17:30', matchweek: 2, status: 'scheduled',
    },
  ]);
}

describe('GameweekBrowser division-view calendar', () => {
  it('clicking a calendar day replaces the matchweek list with that day\'s fixtures', async () => {
    setupDivisionMocks();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    // Matchweek-based list loads first (Arsenal vs Chelsea on DAY_A's matchweek).
    await screen.findByText('Arsenal');
    expect(screen.getByText('Chelsea')).toBeInTheDocument();
    expect(screen.queryByText('Liverpool')).not.toBeInTheDocument();

    // Click day 12 on the calendar.
    const dayButton = await screen.findByRole('button', { name: /^12/ });
    expect(dayButton).not.toBeDisabled();
    await user.click(dayButton);

    // getFixturesForDate should have been called for DAY_B, and the list
    // underneath should now show Liverpool/Everton instead of the
    // matchweek list.
    await waitFor(() => expect(mockedApi.getFixturesForDate).toHaveBeenCalledWith(1, 1, DAY_B));
    await screen.findByText('Liverpool');
    expect(screen.getByText('Everton')).toBeInTheDocument();
    expect(screen.queryByText('Arsenal')).not.toBeInTheDocument();
  });
});
