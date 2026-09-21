import { describe, it, expect } from 'vitest';
import {
  NOT_DISCLOSED, formatMoneyFull, formatMoneyShort, formatRatio, fyLabel, longDate, scaled, seasonLabel, signedLabel, signedMoney,
} from '../lib/financeFormat';
import {
  buildFinanceIndex, groupFinanceByTeam, latestFilingDate, latestPeriod, normalisePeriod, toNum,
} from '../lib/financeApi';
import { southendData, southendPeriodRows, southendTeam, dictionary } from './fixtures/southendFinance';

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
