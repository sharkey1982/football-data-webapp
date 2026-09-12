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
    getLastFixtureRefresh: vi.fn().mockResolvedValue(null),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, '0');
const DAY_A = `${y}-${m}-05`;
const DAY_B = `${y}-${m}-12`;

describe('GameweekBrowser team-view calendar', () => {
  it('clicking a calendar day filters the team fixture list to that date, client-side', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', tier: null, country_id: 1, competition_type: 'league', scope: 'domestic' },
      { league_id: 6, code: 'LC', name: 'Carabao Cup', tier: null, country_id: 1, competition_type: 'cup', scope: 'domestic' },
    ]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 1, label: '2627', start_year: 2026, end_year: 2027 }]);
    mockedApi.getTeams.mockResolvedValue([{ team_id: 10, canonical_name: 'Arsenal', country_id: 1 }]);
    mockedApi.getTeamById.mockResolvedValue({ team_id: 10, canonical_name: 'Arsenal', country_id: 1 });
    mockedApi.getFixturesForTeam.mockResolvedValue([
      {
        fixture_id: 1, league_id: 1, season_id: 1, home_team_id: 10, away_team_id: 2,
        home_team_name: 'Arsenal', away_team_name: 'Chelsea',
        kickoff_date: DAY_A, kickoff_time: '15:00', matchweek: 1, status: 'scheduled',
        league_code: 'E0', league_name: 'Premier League', competition_type: 'league',
      },
      {
        fixture_id: 2, league_id: 6, season_id: 1, home_team_id: 10, away_team_id: 3,
        home_team_name: 'Arsenal', away_team_name: 'Fulham',
        kickoff_date: DAY_B, kickoff_time: '19:45', matchweek: null, status: 'scheduled',
        league_code: 'LC', league_name: 'Carabao Cup', competition_type: 'cup',
      },
    ]);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?view=team&team=10&season=1']}>
        <GameweekBrowser />
      </MemoryRouter>
    );

    // Both fixtures show initially (Chelsea from DAY_A, Fulham from DAY_B).
    await screen.findByText('Chelsea');
    expect(screen.getByText('Fulham')).toBeInTheDocument();

    // Click day 12 (the cup fixture's date) on the team calendar. Two
    // months are shown side by side now, so day "12" can appear twice --
    // pick the enabled one (the other month has no fixture that day).
    const dayButtons = await screen.findAllByRole('button', { name: '12' });
    const dayButton = dayButtons.find((b) => !(b as HTMLButtonElement).disabled);
    expect(dayButton).toBeDefined();
    await user.click(dayButton!);

    // Filtering is client-side (no extra fetch) -- Chelsea's fixture
    // (DAY_A) should now be hidden, Fulham's (DAY_B) should remain.
    await waitFor(() => expect(screen.queryByText('Chelsea')).not.toBeInTheDocument());
    expect(screen.getByText('Fulham')).toBeInTheDocument();
  });
});
