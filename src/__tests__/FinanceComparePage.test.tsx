import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FinanceComparePage from '../pages/FinanceComparePage';
import { groupFinanceByTeam, normalisePeriod } from '../lib/financeApi';
import {
  buildComparison, debtTakeaway, financialYears, forYear, growthTakeaway, raceFrame, raceMax, resultTakeaway, smallClubIds, wageRatio, wageTakeaway,
} from '../lib/financeCompare';

afterEach(cleanup);

// Real latest-year figures (GBP), plus an earlier year for growth.
const M = 1e6;
type V = Partial<Record<string, number | null>>;
const period = (team_id: number, end: string, v: V, extra: Record<string, unknown> = {}) => normalisePeriod({
  team_id, period_end: end, period_months: 12, unit_scale: 1, currency: 'GBP', is_consolidated: true, is_comparable: true,
  is_latest: end.startsWith('2025'), reporting_entity: 'x', company_number: '1', filing_date: '2026-01-01', source_url: null,
  revenue_total: null, staff_costs: null, operating_profit: null, profit_before_tax: null, net_assets: null, cash: null, borrowings: null,
  ...v, ...extra,
} as Record<string, unknown>);
const teams = [
  { team_id: 1, slug: 'liverpool', display_name: 'Liverpool' },
  { team_id: 2, slug: 'man-city', display_name: 'Manchester City' },
  { team_id: 3, slug: 'aston-villa', display_name: 'Aston Villa' },
  { team_id: 4, slug: 'everton', display_name: 'Everton' },
  { team_id: 5, slug: 'southend', display_name: 'Southend' },
];
const periods = [
  period(1, '2020-05-31', { revenue_total: 490 * M }),
  period(1, '2025-05-31', { revenue_total: 702.7 * M, staff_costs: 427.7 * M, operating_profit: 23.8 * M, profit_before_tax: 15.2 * M, net_assets: 159.5 * M, cash: 2.5 * M, borrowings: 67.3 * M }),
  period(2, '2020-06-30', { revenue_total: 478 * M }),
  period(2, '2025-06-30', { revenue_total: 694.1 * M, staff_costs: 408.4 * M, operating_profit: -93.3 * M, profit_before_tax: -9.9 * M, net_assets: 858.4 * M, cash: 173.7 * M, borrowings: null }, { is_consolidated: false }),
  period(3, '2020-05-31', { revenue_total: 117 * M }),
  period(3, '2025-06-30', { revenue_total: 378.1 * M, staff_costs: 273.4 * M, operating_profit: -139.7 * M, profit_before_tax: 17.0 * M, net_assets: 321.1 * M, cash: 7.7 * M, borrowings: 110.6 * M }),
  period(4, '2020-06-30', { revenue_total: 186 * M }),
  period(4, '2025-06-30', { revenue_total: 196.7 * M, staff_costs: 152.1 * M, operating_profit: -75.9 * M, profit_before_tax: -8.6 * M, net_assets: 393.3 * M, cash: 79.1 * M, borrowings: 468.5 * M }),
  period(5, '2019-07-31', { revenue_total: 7.4 * M }),
  period(5, '2025-07-31', { revenue_total: 5.1 * M, staff_costs: null, operating_profit: -1.3 * M, profit_before_tax: -1.3 * M, net_assets: -7.0 * M, cash: 0.8 * M, borrowings: 0.05 * M }, { is_consolidated: false }),
];
const clubs = () => buildComparison(groupFinanceByTeam(teams, periods, [], [], []).values());

function renderPage() {
  return render(<MemoryRouter><FinanceComparePage initialData={clubs()} /></MemoryRouter>);
}

describe('comparison logic', () => {
  it('wage ratio needs both figures -- not disclosed stays null', () => {
    const cs = clubs();
    expect(wageRatio(cs.find((c) => c.team.slug === 'everton')!.latest)).toBeCloseTo(0.773, 2);
    expect(wageRatio(cs.find((c) => c.team.slug === 'southend')!.latest)).toBeNull();
  });
  it('orders by revenue and spots clubs on a much smaller scale', () => {
    const cs = clubs();
    expect(cs[0].team.display_name).toBe('Liverpool');
    expect([...smallClubIds(cs)]).toEqual([5]);
  });
  it('writes takeaways from the data', () => {
    const cs = clubs().filter((c) => c.team.team_id !== 5);
    expect(wageTakeaway(cs)).toBe('Everton spend 77% of revenue on wages; Manchester City 59%.');
    expect(resultTakeaway(cs)).toMatch(/^Aston Villa lost money on day-to-day running but made a profit before tax/);
    expect(debtTakeaway(cs)).toBe('Everton owe the most: £468.5m. Manchester City does not disclose borrowings.');
    expect(growthTakeaway(cs)).toMatch(/^Aston Villa grew revenue the most: £117m to £378.1m \(\+223%\)/);
  });
});

describe('the comparison page', () => {
  it('leaves smaller clubs out by default, and includes them on request', () => {
    renderPage();
    const league = screen.getByRole('list', { name: 'Revenue and wages by club' });
    expect(within(league).queryByText('Southend')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Include smaller clubs \(Southend\)/ }));
    expect(within(screen.getByRole('list', { name: 'Revenue and wages by club' })).getByText('Southend')).toBeInTheDocument();
  });

  it('shows not-disclosed borrowings as n/d in the table, never as £0', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /Latest filed figures/ });
    const city = within(table).getByRole('link', { name: 'Manchester City' }).closest('tr')!;
    const cells = within(city).getAllByRole('cell');
    expect(cells[cells.length - 1].textContent).toBe('n/d'); // Borrowings is the last column
  });

  it('opens with the year-by-year timelapse, above the other charts', () => {
    renderPage();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 3)).toEqual(['Year by year', 'The money league', 'Wages as a share of revenue']);
    expect(headings).not.toContain('Borrowings and cash');
    expect(headings).not.toContain('Day-to-day result vs bottom line');
  });

  it('ranks wage share highest first, with the takeaway', () => {
    renderPage();
    const wages = screen.getByRole('list', { name: 'Wages as a share of revenue' });
    expect(within(wages).getAllByRole('link')[0]).toHaveTextContent('Everton');
    expect(screen.getByText('Everton spend 77% of revenue on wages; Manchester City 59%.')).toBeInTheDocument();
  });

  it('sorts the table by any column, with not-disclosed always last', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /Latest filed figures/ });
    fireEvent.click(within(table).getByRole('button', { name: /Borrowings/ }));
    let rows = within(table).getAllByRole('rowheader').map((r) => r.textContent);
    expect(rows[0]).toMatch(/Everton/);
    expect(rows[rows.length - 1]).toMatch(/Manchester City/);
    fireEvent.click(within(table).getByRole('button', { name: /Borrowings/ }));
    rows = within(table).getAllByRole('rowheader').map((r) => r.textContent);
    expect(rows[rows.length - 1]).toMatch(/Manchester City/); // still last when ascending
  });

  it('marks company-only accounts and links every club to its accounts', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /Latest filed figures/ });
    expect(within(table).getByText(/FY2025 ‡/)).toBeInTheDocument(); // Manchester City
    expect(within(table).getByRole('link', { name: 'Everton' })).toHaveAttribute('href', '/football/teams/everton/finances');
  });

  it('renders no broken text anywhere -- including accessibility labels', () => {
    const html = renderToString(<MemoryRouter><FinanceComparePage initialData={clubs()} /></MemoryRouter>);
    for (const bad of [/undefined/, /NaN/, /\[object/, /\bnull\b/, /Infinity/]) expect(html).not.toMatch(bad);
  });
});

describe('by year', () => {
  it('lists financial years newest first, and picks each club\u2019s period for a year', () => {
    const cs = clubs();
    expect(financialYears(cs)).toEqual(['2025', '2020', '2019']);
    const { view, missing } = forYear(cs, '2020');
    expect(view.map((c) => c.team.display_name)).toEqual(['Liverpool', 'Manchester City', 'Everton', 'Aston Villa']);
    expect(missing).toEqual(['Southend']);
  });

  it('the year filter drives the charts and table, and names clubs with no accounts that year', () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: /Include smaller clubs/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Year' }), { target: { value: '2020' } });
    expect(screen.getByText('No FY2020 accounts on file: Southend.')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Latest filed figures/ });
    expect(within(table).getAllByText(/FY2020/).length).toBe(4);
    expect(within(table).queryByText(/FY2025/)).toBeNull();
  });
});

describe('the year-by-year timelapse', () => {
  it('ranks clubs within a year on a scale fixed across all years', () => {
    const cs = clubs().filter((c) => c.team.team_id !== 5);
    expect(raceFrame(cs, 'revenue_total', '2020').map((r) => r.club.team.display_name)).toEqual(['Liverpool', 'Manchester City', 'Everton', 'Aston Villa']);
    expect(raceFrame(cs, 'revenue_total', '2025').map((r) => r.club.team.display_name)).toEqual(['Liverpool', 'Manchester City', 'Aston Villa', 'Everton']);
    expect(raceMax(cs, 'revenue_total')).toBe(702.7 * M);
  });

  it('leaves undisclosed values out of a frame rather than showing zero', () => {
    const cs = clubs();
    expect(raceFrame(cs, 'borrowings', '2025').map((r) => r.club.team.display_name)).not.toContain('Manchester City');
  });

  it('plays through the years: Aston Villa overtake Everton', () => {
    vi.useFakeTimers();
    renderPage();
    const race = () => screen.getByRole('list', { name: /Revenue by club, FY/ });
    // With Southend hidden the years are FY2020 and FY2025; the slider's first stop is FY2020.
    fireEvent.change(screen.getByRole('slider', { name: 'Year' }), { target: { value: '0' } });
    expect(race()).toHaveAccessibleName('Revenue by club, FY2020');
    const top = (name: string) => Number((within(race()).getByText(name).closest('[role="listitem"]') as HTMLElement).style.top.replace('px', ''));
    expect(top('Everton')).toBeLessThan(top('Aston Villa'));
    fireEvent.click(screen.getByRole('button', { name: /^Play/ }));
    act(() => { vi.advanceTimersByTime(1400); });
    expect(race()).toHaveAccessibleName('Revenue by club, FY2025');
    expect(top('Aston Villa')).toBeLessThan(top('Everton'));
    vi.useRealTimers();
  });

  it('switches measure, and respects reduced motion', () => {
    renderPage();
    // (the table also has a "Wages" column button; the timelapse's has aria-pressed)
    fireEvent.click(screen.getAllByRole('button', { name: 'Wages' }).find((b) => b.hasAttribute('aria-pressed'))!);
    const race = screen.getByRole('list', { name: /Wages by club, FY2025/ });
    expect((race.querySelector('[role="listitem"]') as HTMLElement).className).toMatch(/motion-reduce:transition-none/);
  });
});
