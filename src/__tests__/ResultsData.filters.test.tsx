import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ResultsData from '../pages/ResultsData';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getLeagues: vi.fn(),
    getCountries: vi.fn(),
    getSeasons: vi.fn(),
    getTeams: vi.fn(),
    getRawMatches: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('ResultsData country/competition filters', () => {
  it('narrows the Division dropdown by Competition type and shows a Type badge in results', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' },
      { league_id: 6, code: 'LC', name: 'Carabao Cup', country_id: 1, competition_type: 'cup' },
    ]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.getRawMatches.mockResolvedValue({
      matches: [
        {
          match_id: 1, league_id: 6, season_id: 13, home_team_id: 1, away_team_id: 2,
          home_team_name: 'Arsenal', away_team_name: 'Fulham',
          match_date: '2026-09-10', kickoff_time: '19:45',
          full_time_home_goals: 2, full_time_away_goals: 0, full_time_result: 'H',
          home_yellow_cards: 1, away_yellow_cards: 0, home_red_cards: 0, away_red_cards: 0,
          league_code: 'LC', league_name: 'Carabao Cup', season_label: '2627',
          competition_type: 'cup', country_name: 'England',
        },
      ],
      truncated: false,
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ResultsData />
      </MemoryRouter>
    );

    // Filter the Division dropdown to only Cup competitions.
    await screen.findByText('All countries');
    const competitionSelect = screen.getByLabelText('Competition');
    await user.selectOptions(competitionSelect, 'cup');

    const divisionSelect = screen.getByLabelText('Division') as HTMLSelectElement;
    expect(screen.queryByRole('option', { name: /Premier League/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Carabao Cup/ })).toBeInTheDocument();
    await user.selectOptions(divisionSelect, '6');

    await user.click(screen.getByText('Run query'));

    await screen.findByText('Arsenal');
    expect(mockedApi.getRawMatches).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 6 })
    );
    const table = screen.getByRole('table');
    expect(table.querySelector('td span')?.textContent).toBe('Cup');
  });
});
