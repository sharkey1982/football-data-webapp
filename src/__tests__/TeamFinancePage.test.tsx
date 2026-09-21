import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TeamFinancePage from '../pages/football/TeamFinancePage';
import FinanceIndexPage from '../pages/FinanceIndexPage';
import { buildFinanceIndex } from '../lib/financeApi';
import { southendData, southendTeam } from './fixtures/southendFinance';

afterEach(cleanup);

function renderPage(data = southendData()) {
  return render(
    <MemoryRouter initialEntries={['/football/teams/southend/finances']}>
      <Routes>
        <Route path="/football/teams/:slug/finances" element={<TeamFinancePage initialData={data} />} />
      </Routes>
    </MemoryRouter>
  );
}
const card = (metric: string) => document.querySelector(`li[data-metric="${metric}"]`) as HTMLElement;
const row = (metric: string) => document.querySelector(`tr[data-metric="${metric}"]`) as HTMLElement;

describe('Southend finance page', () => {
  it('shows the header: entity, period, company number, accounts type and the filing link', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Southend finances' })).toBeInTheDocument();
    expect(screen.getAllByText('Southend United Football Club Limited').length).toBeGreaterThan(0);
    expect(screen.getByText(/Year to 31 July 2025 \(FY2025/)).toBeInTheDocument();
    expect(screen.getByText('00089767')).toBeInTheDocument();
    expect(screen.getByText(/Company only/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read the original FY2025 filing/ })).toHaveAttribute('href', expect.stringContaining('00089767'));
  });

  it('shows the FY2025 headline figures from the brief, with context-aware labels', () => {
    renderPage();
    expect(within(card('revenue_total')).getByText('£5.1m')).toBeInTheDocument();
    expect(within(card('revenue_total')).getByText('£5,101,100')).toBeInTheDocument();
    expect(within(card('operating_profit')).getByText('Operating loss')).toBeInTheDocument();
    expect(within(card('operating_profit')).getByText('£1,344,626')).toBeInTheDocument();
    expect(within(card('profit_before_tax')).getByText('Loss before tax')).toBeInTheDocument();
    expect(within(card('profit_before_tax')).getByText('£1,344,800')).toBeInTheDocument();
    expect(within(card('cash')).getByText('£760,239')).toBeInTheDocument();
    expect(within(card('borrowings')).getByText('£47,817')).toBeInTheDocument();
    expect(within(card('net_assets')).getByText('Net liabilities')).toBeInTheDocument();
    expect(within(card('net_assets')).getByText('£6,970,928')).toBeInTheDocument();
    expect(within(card('average_employees')).getByText('59')).toBeInTheDocument();
    // no unexplained minus sign on the labelled cards
    expect(card('operating_profit').textContent).not.toContain('-£');
  });

  it('shows FY2025 staff costs as Not disclosed, never £0', () => {
    renderPage();
    const cells = within(row('staff_costs')).getAllByRole('cell');
    const fy2025 = cells[cells.length - 1];
    expect(within(fy2025).getByLabelText('Not disclosed')).toBeInTheDocument();
    expect(fy2025.textContent).not.toContain('£0');
  });

  it('shows years without borrowings disclosed as Not disclosed, and the disclosed year as a value', () => {
    renderPage();
    const cells = within(row('borrowings')).getAllByRole('cell');
    expect(within(cells[0]).getByLabelText('Not disclosed')).toBeInTheDocument();
    expect(cells[cells.length - 1].textContent).toBe('£48k');
  });

  it('flags FY2024 as not comparable, in the text, the table and the charts', () => {
    renderPage();
    expect(screen.getByRole('note').textContent).toMatch(/FY2024 is not directly comparable/);
    expect(screen.getByRole('columnheader', { name: /FY2024 †/ })).toBeInTheDocument();
    const revenueChart = screen.getByRole('img', { name: /^Revenue:/ });
    expect(revenueChart.getAttribute('aria-label')).toMatch(/FY2024 £2\.52m \(not comparable\)/);
  });

  it('never states a year-on-year change across the non-comparable year', () => {
    renderPage();
    const brief = screen.getByRole('heading', { name: 'In brief' }).parentElement!;
    expect(brief.textContent).not.toMatch(/up from|down from/);
    expect(brief.textContent).toMatch(/FY2024 is not directly comparable/);
  });

  it('has a full annual table with all seven years and proper header semantics', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /published figures by financial year/ });
    const cols = within(table).getAllByRole('columnheader');
    expect(cols).toHaveLength(8); // "Figure" + seven years
    expect(cols.map((c) => c.getAttribute('scope'))).toEqual(Array(8).fill('col'));
    expect(within(table).getAllByRole('rowheader')[0]).toHaveAttribute('scope', 'row');
    // the wrapper is a scrollable, focusable region on small screens
    expect(table.closest('[role="region"]')).toHaveAttribute('tabindex', '0');
  });

  it('labels the derived ratio as FixtureShark-derived, apart from the statutory figures', () => {
    renderPage();
    const r = row('staff_cost_ratio');
    expect(r.textContent).toContain('FixtureShark-derived');
    expect(r.textContent).toContain('102%');
  });

  it('exposes provenance: concept, as-filed value and unit, filing reference, mapping version and document link', () => {
    renderPage();
    const sources = screen.getByRole('table', { name: 'Sources for Revenue' });
    expect(within(sources).getAllByText('core:TurnoverRevenue').length).toBe(2);
    expect(within(sources).getByText('5,101,100 GBP')).toBeInTheDocument();
    expect(within(sources).getByText('AA 2025')).toBeInTheDocument();
    expect(within(sources).getAllByText('v1').length).toBeGreaterThan(0);
    const links = within(sources).getAllByRole('link', { name: 'Filing' });
    expect(links.map((a) => a.getAttribute('href'))).toContain('https://example.test/southend-fy2025.xhtml');
  });

  it('gives every chart a table equivalent', () => {
    renderPage();
    expect(screen.getAllByText('Show as a table').length).toBe(6);
  });
});

describe('empty and missing states', () => {
  it('a real team with no published accounts gets an explanatory empty state, not figures', () => {
    renderPage({ team: { team_id: 1, slug: 'arsenal', display_name: 'Arsenal' }, periods: [], provenance: [], derived: [], dictionary: [] });
    expect(screen.getByText(/has not yet published accounts for Arsenal/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('an unknown team gets "Team not found", consistent with the team page', () => {
    renderPage(null as unknown as ReturnType<typeof southendData>);
    expect(screen.getByRole('heading', { name: 'Team not found' })).toBeInTheDocument();
  });
});

describe('/finance index', () => {
  it('lists clubs from the data, not a hard-coded list', () => {
    render(
      <MemoryRouter>
        <FinanceIndexPage initialData={buildFinanceIndex([southendData()])} />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /Southend/ });
    expect(link).toHaveAttribute('href', '/football/teams/southend/finances');
    expect(link.textContent).toMatch(/FY2025: revenue £5\.1m · loss before tax £1\.34m/);
  });
  it('says so when no club has published accounts', () => {
    render(<MemoryRouter><FinanceIndexPage initialData={[]} /></MemoryRouter>);
    expect(screen.getByText('No club accounts have been published yet.')).toBeInTheDocument();
  });
});

// ---- the team page's Finances link ----------------------------------------
vi.mock('../lib/financeApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/financeApi')>('../lib/financeApi');
  return { ...actual, teamHasFinance: vi.fn().mockResolvedValue(false) };
});
import TeamPage from '../pages/football/TeamPage';

const teamData = (hasFinance?: boolean) => ({
  profile: { ...southendTeam, league_name: 'National League', league_id: 5, goals_for_per_game: null, goals_against_per_game: null, is_estimated: false, fitted_at: null },
  matches: [],
  ...(hasFinance === undefined ? {} : { hasFinance }),
});
function renderTeam(data: ReturnType<typeof teamData>) {
  return render(
    <MemoryRouter initialEntries={['/football/teams/southend']}>
      <Routes><Route path="/football/teams/:slug" element={<TeamPage initialData={data as never} />} /></Routes>
    </MemoryRouter>
  );
}

describe('team page Finances link', () => {
  it('appears when the club has published accounts', () => {
    renderTeam(teamData(true));
    expect(screen.getByRole('link', { name: /Finances/ })).toHaveAttribute('href', '/football/teams/southend/finances');
  });
  it('does not appear for a team with no finance data', async () => {
    renderTeam(teamData(false));
    expect(screen.queryByRole('link', { name: /Finances/ })).toBeNull();
  });
});
