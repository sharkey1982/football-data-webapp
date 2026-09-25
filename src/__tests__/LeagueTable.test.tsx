import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import LeagueTable from '../pages/LeagueTable';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  return {
    getLeagues: vi.fn(),
    getCountries: vi.fn(),
    getLeagueIdsWithResults: vi.fn(),
    getSeasons: vi.fn(),
    getLeagueTable: vi.fn(),
    getPointsRace: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

/** Renders the Fixtures route's query string so a navigation can be asserted on. */
function FixturesProbe() {
  const [params] = useSearchParams();
  return <div data-testid="fixtures-probe">{params.toString()}</div>;
}

beforeEach(() => {
  // Default: every mocked league has results; individual tests narrow it.
  mockedApi.getLeagueIdsWithResults.mockResolvedValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

describe('LeagueTable page', () => {
  it('only offers countries (and divisions) that have results', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' },
      { league_id: 2, code: 'N1', name: 'Eredivisie', country_id: 11, competition_type: 'league' },
      { league_id: 3, code: 'X1', name: 'Empty League', country_id: 7, competition_type: 'league' },
      { league_id: 9, code: 'UCL', name: 'Champions League', country_id: 3, competition_type: 'cup' },
    ]);
    mockedApi.getCountries.mockResolvedValue([
      { country_id: 1, name: 'England', code: null },
      { country_id: 11, name: 'Netherlands', code: null },
      { country_id: 7, name: 'Norway', code: null },
      { country_id: 3, name: 'Europe', code: null },
      { country_id: 29, name: 'Georgia', code: null },
    ]);
    mockedApi.getLeagueIdsWithResults.mockResolvedValue([1, 2, 9]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
    mockedApi.getLeagueTable.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/table']}>
        <LeagueTable />
      </MemoryRouter>
    );

    await screen.findByRole('option', { name: 'Netherlands' });
    expect(screen.getByRole('option', { name: 'England' })).toBeInTheDocument();
    // League exists but has no results / only cup results / no league at all.
    expect(screen.queryByRole('option', { name: 'Norway' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Europe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Georgia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Empty League/ })).not.toBeInTheDocument();
  });

  it('drops a URL country that has no results back to All countries', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' },
    ]);
    mockedApi.getCountries.mockResolvedValue([
      { country_id: 1, name: 'England', code: null },
      { country_id: 29, name: 'Georgia', code: null },
    ]);
    mockedApi.getLeagueIdsWithResults.mockResolvedValue([1]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
    mockedApi.getLeagueTable.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/table?country=29']}>
        <LeagueTable />
      </MemoryRouter>
    );

    // The Division list only fills once the country has fallen back to All
    // (a select's DOM value reads '' for an unknown value, so assert on this).
    await screen.findByRole('option', { name: /Premier League/ });
    expect(screen.queryByRole('option', { name: 'Georgia' })).not.toBeInTheDocument();
    const countrySelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(countrySelect.value).toBe('');
  });

  it('excludes cup competitions from the Division dropdown and shows deduction annotations', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' },
      { league_id: 6, code: 'LC', name: 'Carabao Cup', country_id: 1, competition_type: 'cup' },
    ]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
    mockedApi.getLeagueTable.mockResolvedValue([
      {
        team_id: 1, team_name: 'Arsenal', played: 3, won: 3, drawn: 0, lost: 0,
        goalsFor: 6, goalsAgainst: 1, goalDifference: 5,
        pointsBeforeAdjustment: 9, pointsAdjustment: 0, points: 9, deductions: [],
      },
      {
        team_id: 2, team_name: 'Everton', played: 3, won: 2, drawn: 0, lost: 1,
        goalsFor: 5, goalsAgainst: 3, goalDifference: 2,
        pointsBeforeAdjustment: 12, pointsAdjustment: -6, points: 6,
        deductions: [{ deduction_id: 1, league_id: 1, season_id: 13, team_id: 2, points: -6, reason: 'Breach of profitability rules', effective_date: null, created_at: '' }],
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/table']}>
        <LeagueTable />
      </MemoryRouter>
    );

    await screen.findByText('Arsenal');

    // Cup competitions never appear in the Division dropdown here.
    expect(screen.queryByRole('option', { name: /Carabao Cup/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Premier League/ })).toBeInTheDocument();

    // Rows render in the order getLeagueTable already sorted them.
    const teamCells = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(teamCells[0]).toContain('Arsenal');
    expect(teamCells[1]).toContain('Everton');

    // Deducted team shows its adjusted points and the annotation/footnote.
    expect(screen.getByText('(-6)')).toBeInTheDocument();
    expect(screen.getByText(/Breach of profitability rules/)).toBeInTheDocument();
  });

  it('clicking a team name navigates to its Fixtures Team view for the selected season', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' },
    ]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
    mockedApi.getLeagueTable.mockResolvedValue([
      {
        team_id: 42, team_name: 'Fulham', played: 3, won: 1, drawn: 1, lost: 1,
        goalsFor: 3, goalsAgainst: 3, goalDifference: 0,
        pointsBeforeAdjustment: 4, pointsAdjustment: 0, points: 4, deductions: [],
      },
    ]);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/table']}>
        <Routes>
          <Route path="/table" element={<LeagueTable />} />
          <Route path="/fixtures" element={<FixturesProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByText('Fulham'));

    const probe = await screen.findByTestId('fixtures-probe');
    const params = new URLSearchParams(probe.textContent ?? '');
    expect(params.get('view')).toBe('team');
    expect(params.get('team')).toBe('42');
    expect(params.get('season')).toBe('13');
  });

  it('toggles between the table and a timelapse, loading the race only when asked', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' }]);
    mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
    mockedApi.getSeasons.mockResolvedValue([{ season_id: 12, label: '2526', start_year: 2025, end_year: 2026 }]);
    mockedApi.getLeagueTable.mockResolvedValue([
      { team_id: 1, team_name: 'Arsenal', played: 2, won: 2, drawn: 0, lost: 0, goalsFor: 4, goalsAgainst: 0, goalDifference: 4, pointsBeforeAdjustment: 6, pointsAdjustment: 0, points: 6, deductions: [] },
    ]);
    mockedApi.getPointsRace.mockReset();
    mockedApi.getPointsRace.mockResolvedValue({ frames: 2, series: [{ id: 1, name: 'Arsenal', values: [3, 6] }, { id: 2, name: 'Chelsea', values: [1, 4] }] });
    render(<MemoryRouter initialEntries={['/table?league=1&season=12']}><Routes><Route path="/table" element={<LeagueTable />} /></Routes></MemoryRouter>);
    const toggle = await screen.findByRole('button', { name: 'Timelapse' });
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockedApi.getPointsRace).not.toHaveBeenCalled();
    await userEvent.click(toggle);
    expect(await screen.findByRole('list', { name: 'Points, After 2 games' })).toBeInTheDocument();
    expect(mockedApi.getPointsRace).toHaveBeenCalledWith(1, 12);
    expect(screen.queryByRole('table', { name: /league table/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.queryByRole('list', { name: /Points,/ })).toBeNull();
  });
});
