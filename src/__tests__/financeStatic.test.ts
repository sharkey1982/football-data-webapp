import { describe, it, expect } from 'vitest';
// @ts-expect-error -- plain .mjs build script, no type declarations
import { fetchFinanceBulk, buildFinanceSite } from '../../scripts/lib/financeStatic.mjs';
import {
  attachDivisions, buildFinanceIndex, groupFinanceByTeam, latestFilingDate, normaliseDerived, normalisePeriod, normaliseProvenance,
} from '../lib/financeApi';
import { renderTeamFinancePage, renderFinanceIndexPage } from '../entry-server';
import { southendData, southendPeriodRows, southendProvenanceRows, southendDerivedRows, dictionary } from './fixtures/southendFinance';

// The same functions the build scripts import from the SSR bundle.
const entry = { attachDivisions, buildFinanceIndex, groupFinanceByTeam, latestFilingDate, normaliseDerived, normalisePeriod, normaliseProvenance };

function fakeDb(clubCount: number) {
  const periods: Record<string, unknown>[] = [];
  const teams: Record<string, unknown>[] = [];
  for (let i = 0; i < clubCount; i++) {
    const id = 1000 + i;
    teams.push({ team_id: id, slug: `club-${i}`, display_name: `Club ${i}` });
    for (const r of southendPeriodRows) periods.push({ ...r, team_id: id });
  }
  const calls: string[] = [];
  const queryAll = async (path: string) => {
    calls.push(path);
    if (path.startsWith('finance_published_periods')) return periods;
    if (path.startsWith('finance_published_provenance')) return southendProvenanceRows.map((r) => ({ ...r, team_id: 1000 }));
    if (path.startsWith('finance_derived_metrics')) return southendDerivedRows.map((r) => ({ ...r, team_id: 1000 }));
    if (path.startsWith('finance_metric_dictionary')) return dictionary;
    if (path.startsWith('finance_club_divisions')) return [{ team_id: 1000, league_code: 'E1', league_name: 'Championship', league_slug: 'championship', country: 'England', country_order: 0, division_order: 2 }];
    if (path.startsWith('teams')) return teams;
    return null;
  };
  return { queryAll, calls };
}

describe('static generation fetches in bulk', () => {
  it('makes six requests in total, whether there is one club or fifty', async () => {
    for (const n of [1, 50]) {
      const db = fakeDb(n);
      const bulk = await fetchFinanceBulk(db.queryAll);
      const site = buildFinanceSite(bulk, entry);
      expect(db.calls).toHaveLength(6);
      expect(site.clubs).toHaveLength(n);
    }
  });

  it('attaches each club\u2019s current division, and leaves it unset when unknown', async () => {
    const db = fakeDb(2);
    const site = buildFinanceSite(await fetchFinanceBulk(db.queryAll), entry);
    const byId = new Map(site.clubs.map((c: { team: { team_id: number; division?: { league_name: string } } }) => [c.team.team_id, c.team]));
    expect(byId.get(1000)?.division?.league_name).toBe('Championship');
    expect(byId.get(1001)?.division).toBeUndefined();
  });

  it('fetches the teams for exactly the team_ids that have published periods', async () => {
    const db = fakeDb(3);
    await fetchFinanceBulk(db.queryAll);
    expect(db.calls.find((c) => c.startsWith('teams'))).toContain('team_id=in.(1000,1001,1002)');
  });

  it('includes any club with published data, not only Premier League teams', async () => {
    const db = fakeDb(1);
    const site = buildFinanceSite(await fetchFinanceBulk(db.queryAll), entry);
    expect(site.sitemap).toEqual([{ path: '/football/teams/club-0/finances', lastmod: '2026-04-30' }]);
    expect(site.teamIds.has(1000)).toBe(true);
  });

  it('skips cleanly when the periods view cannot be read', async () => {
    const bulk = await fetchFinanceBulk(async () => null);
    expect(bulk).toBeNull();
  });
});

describe('server rendering', () => {
  it('pre-renders real figures into the HTML before hydration, with title, description and canonical', () => {
    const page = renderTeamFinancePage('southend', southendData());
    // React separates adjacent text in server HTML with invisible <!-- -->
    // markers; readers and crawlers see the joined text.
    page.html = page.html.replace(/<!-- -->/g, '');
    expect(page.html).toContain('Southend finances');
    expect(page.html).toContain('£5,101,100');
    expect(page.html).toContain('Operating loss');
    expect(page.html).toContain('Net liabilities');
    expect(page.html).toContain('Not disclosed');
    expect(page.title).toMatch(/^Southend finances/);
    expect(page.description).toMatch(/FY2019–FY2025/);
    expect(page.description).toMatch(/revenue £5\.1m, loss before tax £1\.34m/);
    expect(page.canonical).toMatch(/\/football\/teams\/southend\/finances$/);
  });

  it('pre-renders the /finance index', () => {
    const page = renderFinanceIndexPage(buildFinanceIndex([southendData()]));
    expect(page.html).toContain('/football/teams/southend/finances');
    expect(page.canonical).toMatch(/\/finance$/);
  });
});
