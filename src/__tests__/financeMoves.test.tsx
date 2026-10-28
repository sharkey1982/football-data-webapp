import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FinanceMovesPage from '../pages/FinanceMovesPage';
import { allMoves, clubMoves, groupMoves, groupTakeaway, leagueWithArticle, median } from '../lib/financeMoves';
import type { ClubFinanceData, FinanceDivision, FinancePeriod } from '../lib/financeApi';

afterEach(cleanup);

const D: Record<string, FinanceDivision> = {
  pl: { league_code: 'E0', league_name: 'Premier League', league_slug: 'premier-league', country: 'England', country_order: 0, division_order: 1 },
  ch: { league_code: 'E1', league_name: 'Championship', league_slug: 'championship', country: 'England', country_order: 0, division_order: 2 },
  l1: { league_code: 'E2', league_name: 'League One', league_slug: 'league-one', country: 'England', country_order: 0, division_order: 3 },
};

function period(team_id: number, end: string, div: FinanceDivision | null, rev: number | null, wages: number | null, pbt: number | null, extra: Partial<FinancePeriod> = {}): FinancePeriod {
  return {
    team_id, period_start: null, period_end: end, period_months: 12, season_id: null, reporting_entity: null, company_number: null,
    is_consolidated: true, currency: 'GBP', unit_scale: 1, is_latest: false, is_comparable: true, filing_date: null, source_url: null,
    validation_status: 'published', division: div, revenue_total: rev, staff_costs: wages, profit_before_tax: pbt, ...extra,
  } as FinancePeriod;
}

function club(id: number, name: string, periods: FinancePeriod[]): ClubFinanceData {
  return { team: { team_id: id, slug: `club-${id}`, display_name: name }, periods, provenance: [], derived: [], dictionary: [] };
}

const A = club(1, 'Alpha', [
  period(1, '2022-06-30', D.ch, 30e6, 30e6, -10e6),
  period(1, '2023-06-30', D.pl, 120e6, 80e6, 5e6),   // promoted: +300%
  period(1, '2024-06-30', D.ch, 90e6, 70e6, -20e6),  // relegated
]);
const B = club(2, 'Bravo', [
  period(2, '2022-05-31', D.ch, 20e6, 25e6, -15e6),
  period(2, '2023-05-31', D.pl, 100e6, 60e6, 2e6),   // promoted: +400%
]);
const C = club(3, 'Charlie', [
  period(3, '2022-06-30', D.ch, 10e6, 9e6, null),
  period(3, '2023-07-31', D.pl, 80e6, null, null, { period_months: 13, is_comparable: false }), // promoted, not comparable
]);
const GAP = club(4, 'Delta', [
  period(4, '2021-06-30', D.ch, 10e6, 9e6, -1e6),
  period(4, '2023-06-30', D.l1, 5e6, 6e6, -2e6),     // two years apart: not a move
  period(4, '2024-06-30', D.l1, 5e6, 6e6, -2e6),     // same division: not a move
]);
const EUR = club(5, 'Echo', [
  period(5, '2022-06-30', D.ch, 10e6, 9e6, 0, { currency: 'EUR' }),
  period(5, '2023-06-30', D.pl, 20e6, 9e6, 0, { currency: 'EUR' }),
]);

describe('finance moves', () => {
  it('finds promotions and relegations between consecutive seasons only', () => {
    const ms = clubMoves(A);
    expect(ms.map((m) => m.direction)).toEqual(['promoted', 'relegated']);
    expect(ms[0].revenueChange).toBeCloseTo(3);
    expect(ms[0].wagesBefore).toBeCloseTo(1);
    expect(clubMoves(GAP)).toEqual([]);
    expect(clubMoves(EUR)).toEqual([]);
  });

  it('keeps missing figures as null, never zero', () => {
    const [m] = clubMoves(C);
    expect(m.wagesAfter).toBeNull();
    expect(m.pbtBefore).toBeNull();
    expect(m.comparable).toBe(false);
  });

  it('groups by kind and takes medians from comparable moves only', () => {
    const groups = groupMoves(allMoves([A, B, C, GAP, EUR]));
    expect(groups.map((g) => g.key)).toEqual(['premier-league>championship', 'championship>premier-league']);
    const up = groups[1];
    expect(up.moves).toHaveLength(3);
    expect(up.comparableCount).toBe(2);
    expect(up.medianRevenueChange).toBeCloseTo(3.5);
    expect(up.lossesAfter).toEqual({ losses: 0, of: 2 });
    expect(groupTakeaway(up)).toBe('After going up from the Championship to the Premier League, revenue rose by a median 350% (2 comparable moves).');
    // One relegation: too few for a median, and no sentence.
    expect(groups[0].medianRevenueChange).toBeNull();
    expect(groupTakeaway(groups[0])).toBeNull();
  });

  it('writes league names the way they are said', () => {
    expect(leagueWithArticle('League One')).toBe('League One');
    expect(leagueWithArticle('Championship')).toBe('the Championship');
  });

  it('median handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('promotion and relegation page', () => {
  it('shows a card per kind of move, and filters the table by direction', () => {
    render(<MemoryRouter><FinanceMovesPage initialData={allMoves([A, B, C])} /></MemoryRouter>);
    expect(screen.getAllByTestId('move-group')).toHaveLength(2);
    expect(screen.getAllByTestId('move-row')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Relegated (1)' }));
    const rows = screen.getAllByTestId('move-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Alpha');
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/football/teams/club-1/finances');
  });

  it('says so when there are no moves yet', () => {
    render(<MemoryRouter><FinanceMovesPage initialData={[]} /></MemoryRouter>);
    expect(screen.getByText(/No club with published accounts has changed division/)).toBeInTheDocument();
  });
});
