import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import FinanceIndexPage from '../pages/FinanceIndexPage';
import FinanceComparePage from '../pages/FinanceComparePage';
import TeamFinancePage from '../pages/football/TeamFinancePage';
import { buildComparison } from '../lib/financeCompare';
import { attachDivisions, attachPeriodDivisions, buildFinanceIndex, divisionOptions, divisionShort, inDivision, type ClubFinanceData, type FinanceTeam } from '../lib/financeApi';
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

const pdiv = (team_id: number, period_end: string, code: string, name: string, slug: string, order: number) =>
  ({ team_id, period_end, league_code: code, league_name: name, league_slug: slug, country: 'England', country_order: 0, division_order: order });

/** Club 1 is in the Premier League now but was in the Championship in the
 *  season of its 2025 accounts; club 2 the reverse. */
function seasonClubs(): ClubFinanceData[] {
  return clubs().slice(0, 2).map((d) => {
    const id = d.team.team_id;
    const rows = d.periods.map((p) => id === 1
      ? pdiv(id, p.period_end, 'E1', 'Championship', 'championship', 2)
      : pdiv(id, p.period_end, 'E0', 'Premier League', 'premier-league', 1));
    return { ...d, periods: attachPeriodDivisions(d.periods, rows) };
  });
}

describe('division in the season the accounts cover', () => {
  it('gives short labels for the English pyramid and names elsewhere', () => {
    expect(divisionShort({ league_code: 'E1', league_name: 'Championship', league_slug: 'championship', country: 'England', country_order: 0, division_order: 2 })).toBe('Champ');
    expect(divisionShort({ league_code: 'SP1', league_name: 'La Liga', league_slug: 'la-liga', country: 'Spain', country_order: 1, division_order: 1 })).toBe('La Liga');
    expect(divisionShort(null)).toBe('');
  });

  it('labels every year on the team page with that season\u2019s division', () => {
    const [d] = seasonClubs();
    render(
      <MemoryRouter initialEntries={['/football/teams/club-1/finances']}>
        <Routes><Route path="/football/teams/:slug/finances" element={<TeamFinancePage initialData={d} />} /></Routes>
      </MemoryRouter>
    );
    const labels = screen.getAllByTestId('period-division').map((e) => e.textContent);
    expect(labels.length).toBe(d.periods.length);
    expect(new Set(labels)).toEqual(new Set(['Champ']));
    expect(screen.getByText(/in the Championship\)/)).toBeInTheDocument();
  });

  it('filters the compare page by the division that season, not today\u2019s', () => {
    render(
      <MemoryRouter initialEntries={['/finance/compare?division=championship']}>
        <Routes><Route path="/finance/compare" element={<FinanceComparePage initialData={buildComparison(seasonClubs())} />} /></Routes>
      </MemoryRouter>
    );
    // Club 1 is Premier League today but its accounts are a Championship season.
    expect(screen.getByRole('button', { name: 'Championship (1)' })).toHaveAttribute('aria-pressed', 'true');
    const names = screen.getAllByRole('row').map((r) => r.textContent ?? '').filter((t) => /Club \d/.test(t));
    expect(names.some((t) => t.includes('Club 1'))).toBe(true);
    expect(names.some((t) => t.includes('Club 2'))).toBe(false);
  });
});
