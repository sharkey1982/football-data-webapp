import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import FinanceIndexPage from '../pages/FinanceIndexPage';
import { attachDivisions, buildFinanceIndex, divisionOptions, inDivision, type ClubFinanceData, type FinanceTeam } from '../lib/financeApi';
import { southendData } from './fixtures/southendFinance';

afterEach(cleanup);

const div = (team_id: number, league_slug: string, league_name: string, country: string, country_order: number, division_order: number) =>
  ({ team_id, league_code: league_slug.slice(0, 2).toUpperCase(), league_name, league_slug, country, country_order, division_order });

const ROWS = [
  div(1, 'premier-league', 'Premier League', 'England', 0, 1),
  div(2, 'championship', 'Championship', 'England', 0, 2),
  div(3, 'championship', 'Championship', 'England', 0, 2),
  div(4, 'la-liga', 'La Liga', 'Spain', 1, 1),
  div(5, 'national-league', 'National League', 'England', 0, 5),
];
const TEAMS: FinanceTeam[] = [1, 2, 3, 4, 5, 6].map((i) => ({ team_id: i, slug: `club-${i}`, display_name: `Club ${i}` }));

describe('division helpers', () => {
  it('attaches divisions and leaves unknown clubs without one', () => {
    const t = attachDivisions(TEAMS, ROWS);
    expect(t[1].division?.league_name).toBe('Championship');
    expect(t[5].division).toBeUndefined();
  });

  it('orders options down the English pyramid, then other countries, with counts', () => {
    expect(divisionOptions(attachDivisions(TEAMS, ROWS))).toEqual([
      { slug: 'premier-league', name: 'Premier League', count: 1 },
      { slug: 'championship', name: 'Championship', count: 2 },
      { slug: 'national-league', name: 'National League', count: 1 },
      { slug: 'la-liga', name: 'La Liga', count: 1 },
    ]);
  });

  it('matches every club when no division is chosen', () => {
    const [t] = attachDivisions(TEAMS, ROWS);
    expect(inDivision(t, null)).toBe(true);
    expect(inDivision(t, 'premier-league')).toBe(true);
    expect(inDivision(t, 'championship')).toBe(false);
  });
});

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="search">{loc.search}</span>;
}

function clubs(): ClubFinanceData[] {
  const teams = attachDivisions(TEAMS.slice(0, 3), ROWS);
  return teams.map((team) => {
    const d = southendData();
    return { ...d, team, periods: d.periods.map((p) => ({ ...p, team_id: team.team_id })) };
  });
}

function renderIndex(path = '/finance') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/finance" element={<><FinanceIndexPage initialData={buildFinanceIndex(clubs())} /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('finance index division filter', () => {
  it('shows every club with its division, and filters to one division in the URL', () => {
    renderIndex();
    expect(screen.getAllByTestId('club-division').map((e) => e.textContent)).toEqual(['Premier League', 'Championship', 'Championship']);
    fireEvent.click(screen.getByRole('button', { name: 'Championship (2)' }));
    expect(screen.getAllByTestId('club-division')).toHaveLength(2);
    expect(screen.getByTestId('search').textContent).toBe('?division=championship');
    fireEvent.click(screen.getByRole('button', { name: 'All (3)' }));
    expect(screen.getAllByTestId('club-division')).toHaveLength(3);
  });

  it('opens already filtered from a direct link, and ignores an unknown division', () => {
    renderIndex('/finance?division=premier-league');
    expect(screen.getAllByTestId('club-division').map((e) => e.textContent)).toEqual(['Premier League']);
    expect(screen.getByRole('button', { name: 'Premier League (1)' })).toHaveAttribute('aria-pressed', 'true');
    cleanup();
    renderIndex('/finance?division=nonsense');
    expect(screen.getAllByTestId('club-division')).toHaveLength(3);
  });
});
