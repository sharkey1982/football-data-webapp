import { describe, it, expect } from 'vitest';
import {
  NOT_DISCLOSED, formatMoneyFull, formatMoneyShort, formatRatio, fyLabel, longDate, scaled, seasonLabel, signedLabel, signedMoney,
} from '../lib/financeFormat';
import {
  buildFinanceIndex, groupFinanceByTeam, latestFilingDate, latestPeriod, normalisePeriod, toNum,
} from '../lib/financeApi';
import { southendData, southendPeriodRows, southendTeam, dictionary } from './fixtures/southendFinance';
import { comparabilityReason, currencySymbol, periodPhrase, registrationLabel, sourceName, tidyOriginal } from '../lib/financeFormat';
import { buildComparison, otherCurrencyClubs } from '../lib/financeCompare';

describe('currency: shown as filed, never converted', () => {
  it('formats euros with €, pounds by default, and unknown codes by ISO code', () => {
    expect(formatMoneyShort(1_234_000_000, 'EUR')).toBe('€1.23bn');
    expect(formatMoneyShort(5_100_000, 'EUR')).toBe('€5.1m');
    expect(formatMoneyFull(0, 'EUR')).toBe('€0');
    expect(formatMoneyShort(5_100_000)).toBe('£5.1m');
    expect(formatMoneyShort(5_100_000, null)).toBe('£5.1m');
    expect(currencySymbol('CHF')).toBe('CHF ');
    expect(signedMoney('profit_before_tax', -1_340_000, 'x', true, 'EUR')).toEqual({ label: 'Loss before tax', amount: '€1.34m' });
  });

  it('leaves non-GBP clubs out of cross-club comparisons, and names them', () => {
    const gbp = southendData();
    const eur = southendData();
    eur.team = { team_id: 146, slug: 'real-madrid', display_name: 'Real Madrid' };
    eur.periods = eur.periods.map((p) => ({ ...p, team_id: 146, currency: 'EUR' }));
    const clubs = buildComparison([gbp, eur]);
    expect(clubs.map((c) => c.team.slug)).toEqual(['southend']);
    expect(otherCurrencyClubs([gbp, eur])).toEqual(['Real Madrid']);
  });
});

describe('as-filed values', () => {
  it('tidies bare machine numbers without rounding, and leaves printed values alone', () => {
    expect(tidyOriginal('148570.000000000000')).toBe('148,570');
    expect(tidyOriginal('398.0000000000000000')).toBe('398');
    expect(tidyOriginal('-1234.5000')).toBe('-1,234.5');
    expect(tidyOriginal('(16,228)')).toBe('(16,228)');
    expect(tidyOriginal('26,548 + 43,924')).toBe('26,548 + 43,924');
    expect(tidyOriginal('-')).toBe('-');
    expect(tidyOriginal(null)).toBeNull();
  });
});

describe('sources and comparability wording', () => {
  it('names the publisher from the source URL', () => {
    expect(sourceName('https://find-and-update.company-information.service.gov.uk/company/00089767/filing-history/x/document')).toBe('Companies House');
    expect(sourceName('https://www.sec.gov/Archives/edgar/data/1549107/x.htm')).toBe('the US SEC (EDGAR)');
    expect(sourceName('https://www.realmadrid.com/report.pdf')).toBe('the club\u2019s audited annual report');
    expect(registrationLabel('https://www.realmadrid.com/report.pdf')).toBe('Registration number');
  });

  it('explains period length and scope switches, and falls back to restatement', () => {
    const base = { period_end: '2025-06-30', period_months: 12, is_consolidated: false, is_comparable: false };
    expect(comparabilityReason({ ...base, period_months: 13 }, base)).toBe('a 13-month accounting period');
    expect(comparabilityReason({ ...base, is_consolidated: true }, base)).toBe('the accounts start covering the whole group');
    expect(comparabilityReason(base, base)).toMatch(/^restated or reclassified/);
    expect(periodPhrase('2025-06-30', 13)).toBe('13 months to 30 June 2025');
    expect(periodPhrase('2025-06-30', 12)).toBe('Year to 30 June 2025');
  });
});

describe('null versus zero', () => {
  it('never turns a missing value into zero', () => {
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum('')).toBeNull();
    expect(scaled(null, 1000)).toBeNull();
    expect(formatMoneyShort(null)).toBe(NOT_DISCLOSED);
    expect(formatMoneyFull(null)).toBe(NOT_DISCLOSED);
  });

  it('shows a disclosed zero as £0, distinct from not disclosed', () => {
    expect(toNum('0')).toBe(0);
    expect(formatMoneyShort(0)).toBe('£0');
    expect(formatMoneyFull(0)).toBe('£0');
  });

  it('keeps FY2025 staff costs null, and FY2019 borrowings null, after normalising', () => {
    const d = southendData();
    const fy25 = d.periods.find((p) => p.period_end === '2025-07-31')!;
    const fy19 = d.periods.find((p) => p.period_end === '2019-07-31')!;
    expect(fy25.staff_costs).toBeNull();
    expect(fy19.borrowings).toBeNull();
    expect(fy25.borrowings).toBe(47817);
  });
});

describe('negative values read as words', () => {
  it('labels losses and net liabilities, and shows the amount unsigned', () => {
    expect(signedLabel('operating_profit', -1344626, 'Operating profit')).toBe('Operating loss');
    expect(signedLabel('operating_profit', 10, 'Operating profit')).toBe('Operating profit');
    expect(signedLabel('net_assets', -6970928, 'Net assets')).toBe('Net liabilities');
    expect(signedLabel('profit_before_tax', -1344800, 'Profit before tax')).toBe('Loss before tax');
    expect(signedMoney('net_assets', -6970928, 'Net assets', false)).toEqual({ label: 'Net liabilities', amount: '£6,970,928' });
  });

  it('uses a neutral label when there is no value to take a sign from', () => {
    expect(signedLabel('operating_profit', null, 'Operating profit')).toBe('Operating profit or loss');
  });

  it('uses the published sign exactly as given', () => {
    const p = normalisePeriod(southendPeriodRows[6] as Record<string, unknown>);
    expect(p.operating_profit).toBe(-1344626);
    expect(p.net_assets).toBe(-6970928);
  });
});

describe('formatting', () => {
  it('abbreviates sensibly', () => {
    expect(formatMoneyShort(5101100)).toBe('£5.1m');
    expect(formatMoneyShort(760239)).toBe('£760k');
    expect(formatMoneyShort(47817)).toBe('£48k');
    expect(formatMoneyShort(12345678)).toBe('£12.3m');
    expect(formatMoneyFull(5101100)).toBe('£5,101,100');
  });
  it('treats the staff-cost ratio as a fraction, including above 100%', () => {
    expect(formatRatio(1.0236517877422398)).toBe('102%');
    expect(formatRatio(0.84)).toBe('84%');
    expect(formatRatio(null)).toBe(NOT_DISCLOSED);
  });
  it('names periods and seasons', () => {
    expect(fyLabel('2025-07-31')).toBe('FY2025');
    expect(longDate('2025-07-31')).toBe('31 July 2025');
    expect(seasonLabel('2025-07-31')).toBe('2024/25');
  });
});

describe('comparability', () => {
  it('only an explicit false marks a period non-comparable; the flag is never overridden', () => {
    const d = southendData();
    expect(d.periods.filter((p) => !p.is_comparable).map((p) => p.period_end)).toEqual(['2024-07-31']);
    expect(normalisePeriod({ ...southendPeriodRows[0], is_comparable: null } as Record<string, unknown>).is_comparable).toBe(true);
  });
});

describe('bulk grouping (static generation)', () => {
  it('splits one bulk result set across many clubs, joining only on team_id', () => {
    const other = { team_id: 99, slug: 'other', display_name: 'Other' };
    const rows = [
      ...southendPeriodRows.map((r) => normalisePeriod(r as Record<string, unknown>)),
      normalisePeriod({ ...southendPeriodRows[0], team_id: 99, period_end: '2025-06-30', is_latest: true } as Record<string, unknown>),
      // a row for a team_id with no matching team is dropped, never guessed
      normalisePeriod({ ...southendPeriodRows[0], team_id: 12345 } as Record<string, unknown>),
    ];
    const g = groupFinanceByTeam([southendTeam, other], rows, [], [], dictionary);
    expect([...g.keys()].sort()).toEqual([70, 99]);
    expect(g.get(70)!.periods).toHaveLength(7);
    expect(g.get(70)!.periods.map((p) => p.period_end)).toEqual([...southendPeriodRows.map((r) => r.period_end)].sort());
    expect(g.get(99)!.periods).toHaveLength(1);
  });

  it('drops teams without published periods', () => {
    const g = groupFinanceByTeam([southendTeam, { team_id: 5, slug: 'x', display_name: 'X' }], [], [], [], []);
    expect(g.size).toBe(0);
  });

  it('finds the latest period and filing date', () => {
    const d = southendData();
    expect(latestPeriod(d.periods)!.period_end).toBe('2025-07-31');
    expect(latestFilingDate(d.periods)).toBe('2026-04-30');
    expect(buildFinanceIndex([d])[0].periodCount).toBe(7);
  });
});
