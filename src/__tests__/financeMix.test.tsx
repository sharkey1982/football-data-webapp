import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FinanceComparePage from '../pages/FinanceComparePage';
import { mixClubs, mixTakeaway, revenueMix, tradingClubs, tradingTakeaway } from '../lib/financeMix';
import type { ComparisonClub } from '../lib/financeCompare';
import type { FinancePeriod } from '../lib/financeApi';

afterEach(cleanup);

function period(o: Partial<FinancePeriod>): FinancePeriod {
  return {
    team_id: 1, period_start: null, period_end: '2025-06-30', period_months: 12, season_id: 11, reporting_entity: null, company_number: null,
    is_consolidated: true, currency: 'GBP', unit_scale: 1, is_latest: true, is_comparable: true, filing_date: null, source_url: null, validation_status: 'published',
    revenue_total: null, revenue_matchday: null, revenue_broadcast: null, revenue_commercial: null, revenue_other: null, staff_costs: null,
    player_amortisation: null, player_impairment: null, profit_on_player_disposals: null, operating_profit: null, profit_before_tax: null,
    profit_after_tax: null, cash: null, borrowings: null, total_assets: null, total_liabilities: null, net_assets: null, average_employees: null, ...o,
  } as FinancePeriod;
}
const club = (id: number, name: string, p: Partial<FinancePeriod>): ComparisonClub => {
  const latest = period({ team_id: id, ...p });
  return { team: { team_id: id, slug: `c${id}`, display_name: name }, periods: [latest], latest };
};

const A = club(1, 'Alpha', { revenue_total: 100, revenue_matchday: 20, revenue_broadcast: 60, revenue_commercial: 20, revenue_other: null, profit_on_player_disposals: 10, player_amortisation: 5, profit_before_tax: 4 });
const B = club(2, 'Bravo', { revenue_total: 100, revenue_matchday: 30, revenue_broadcast: 30, revenue_commercial: 30, revenue_other: 10, profit_on_player_disposals: 2, profit_before_tax: -5 });
const C = club(3, 'Charlie', { revenue_total: 100, revenue_commercial: 10, revenue_other: 90 }); // no matchday/broadcast split
const D = club(4, 'Delta', { revenue_total: 100, revenue_matchday: 10, revenue_broadcast: 10, revenue_commercial: 10, revenue_other: 10 }); // parts don't add up

describe('revenue mix', () => {
  it('uses only clubs whose split is complete and adds up', () => {
    expect(revenueMix(A.latest)).toMatchObject({ matchday: 0.2, broadcast: 0.6, commercial: 0.2, other: 0 });
    expect(revenueMix(C.latest)).toBeNull();
    expect(revenueMix(D.latest)).toBeNull();
    const { shown, unsplit } = mixClubs([B, C, A, D]);
    expect(shown.map((r) => r.club.team.display_name)).toEqual(['Alpha', 'Bravo']);
    expect(unsplit).toEqual(['Charlie', 'Delta']);
    expect(mixTakeaway(shown)).toBe('Alpha take 60% of revenue from broadcasting and league payments; Bravo 30%.');
  });
});

describe('player trading', () => {
  it('takes player sales out of the pre-tax result and names clubs they saved', () => {
    const { shown, undisclosed } = tradingClubs([B, A, C]);
    expect(shown.map((t) => t.club.team.display_name)).toEqual(['Alpha', 'Bravo']);
    expect(shown[0].pbtWithoutSales).toBe(-6);
    expect(shown[0].salesShare).toBeCloseTo(0.1);
    expect(undisclosed).toEqual(['Charlie']);
    expect(tradingTakeaway(shown)).toBe('Alpha made a pre-tax profit only because of player sales; without them it would have made a loss.');
  });
});

describe('compare page sections', () => {
  it('shows the revenue mix and player trading, naming clubs left out', () => {
    render(<MemoryRouter><FinanceComparePage initialData={[A, B, C, D]} /></MemoryRouter>);
    expect(screen.getByTestId('revenue-mix').querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText(/don.t split revenue this way: Charlie, Delta/)).toBeInTheDocument();
    expect(screen.getByTestId('player-trading').querySelectorAll('li')).toHaveLength(2);
  });
});
