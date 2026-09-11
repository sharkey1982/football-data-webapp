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

describe('ResultsData query filters', () => {
  it('sends competitionType to the query even with no specific Division picked', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' },
      { league_id: 6, code: 'LC', name: 'Carabao Cup', country_id: 1, competition_type: 'cup' },
    ]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.getRawMatches.mockResolvedValue({ matches: [], truncated: false });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ResultsData />
      </MemoryRouter>
    );

    await screen.findByText('All countries');
    await user.selectOptions(screen.getByLabelText('Season'), '13');
    await user.selectOptions(screen.getByLabelText('Competition'), 'cup');
    // Deliberately leave Division on "All divisions".
    await user.click(screen.getByText('Run query'));

    expect(mockedApi.getRawMatches).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: undefined, seasonId: 13, competitionType: 'cup' })
    );
  });
});
