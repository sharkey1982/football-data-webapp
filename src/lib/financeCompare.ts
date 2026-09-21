// ============================================================================
// src/lib/financeCompare.ts
//
// Club-by-club comparison of the latest filed accounts. Pure functions only,
// so the rules can be tested without React or Supabase:
//   * NULL stays "not disclosed" -- never zero, never estimated;
//   * a ratio needs BOTH figures;
//   * takeaways are written from the data, and say nothing when the data
//     can't support the sentence.
// ============================================================================

import { latestPeriod, type ClubFinanceData, type FinancePeriod, type FinanceTeam } from './financeApi';
import { formatMoneyShort, scaled } from './financeFormat';

export type ComparisonClub = { team: FinanceTeam; periods: FinancePeriod[]; latest: FinancePeriod };

/** A figure from a period in pounds (unit scale applied). Null stays null. */
export function money(p: FinancePeriod, k: 'revenue_total' | 'staff_costs' | 'operating_profit' | 'profit_before_tax' | 'net_assets' | 'cash' | 'borrowings'): number | null {
  return scaled(p[k], p.unit_scale);
}

/** Staff costs as a share of revenue (0-1). Null unless BOTH are disclosed. */
export function wageRatio(p: FinancePeriod): number | null {
  const w = money(p, 'staff_costs');
  const r = money(p, 'revenue_total');
  return w == null || r == null || r <= 0 ? null : w / r;
}

/** Every club with a latest period, largest revenue first. */
export function buildComparison(data: Iterable<ClubFinanceData>): ComparisonClub[] {
  const out: ComparisonClub[] = [];
  for (const d of data) {
    const latest = latestPeriod(d.periods);
    if (latest) out.push({ team: d.team, periods: d.periods, latest });
  }
  return out.sort((a, b) => (money(b.latest, 'revenue_total') ?? -1) - (money(a.latest, 'revenue_total') ?? -1));
}

/** Clubs on a much smaller scale (under a tenth of the median revenue) --
 *  shown only on request, so they don't flatten every chart. */
export function smallClubIds(clubs: ComparisonClub[]): Set<number> {
  const revs = clubs.map((c) => money(c.latest, 'revenue_total')).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (revs.length < 3) return new Set();
  const median = revs[Math.floor(revs.length / 2)];
  return new Set(clubs.filter((c) => (money(c.latest, 'revenue_total') ?? 0) < median / 10).map((c) => c.team.team_id));
}

const names = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function wageTakeaway(clubs: ComparisonClub[]): string | null {
  const rows = clubs.map((c) => ({ n: c.team.display_name, r: wageRatio(c.latest) })).filter((x): x is { n: string; r: number } => x.r != null).sort((a, b) => b.r - a.r);
  if (rows.length < 2) return null;
  const hi = rows[0], lo = rows[rows.length - 1];
  return `${hi.n} spend ${pct(hi.r)} of revenue on wages; ${lo.n} ${pct(lo.r)}.`;
}

export function resultTakeaway(clubs: ComparisonClub[]): string | null {
  const turned = clubs
    .filter((c) => { const op = money(c.latest, 'operating_profit'), pbt = money(c.latest, 'profit_before_tax'); return op != null && pbt != null && op < 0 && pbt > 0; })
    .map((c) => c.team.display_name);
  if (turned.length) return `${names(turned)} lost money on day-to-day running but made a profit before tax, helped by items below the operating line such as player sales.`;
  const losses = clubs.filter((c) => (money(c.latest, 'profit_before_tax') ?? 0) < 0).length;
  return losses ? `${losses} of ${clubs.length} clubs made a loss before tax.` : null;
}

export function debtTakeaway(clubs: ComparisonClub[]): string | null {
  const withDebt = clubs.map((c) => ({ n: c.team.display_name, b: money(c.latest, 'borrowings') })).filter((x): x is { n: string; b: number } => x.b != null).sort((a, b) => b.b - a.b);
  const hidden = clubs.filter((c) => money(c.latest, 'borrowings') == null).map((c) => c.team.display_name);
  if (!withDebt.length) return null;
  return `${withDebt[0].n} owe the most: ${formatMoneyShort(withDebt[0].b)}.${hidden.length ? ` ${names(hidden)} ${hidden.length === 1 ? 'does' : 'do'} not disclose borrowings.` : ''}`;
}

/** Revenue change from the first to the latest filed year. */
export function revenueGrowth(c: ComparisonClub): { from: number; to: number; change: number; crossesNonComparable: boolean } | null {
  const ps = c.periods.filter((p) => money(p, 'revenue_total') != null);
  if (ps.length < 2) return null;
  const from = money(ps[0], 'revenue_total')!, to = money(ps[ps.length - 1], 'revenue_total')!;
  if (from <= 0) return null;
  return { from, to, change: to / from - 1, crossesNonComparable: ps.slice(1).some((p) => !p.is_comparable) };
}

export function growthTakeaway(clubs: ComparisonClub[]): string | null {
  const rows = clubs.map((c) => ({ n: c.team.display_name, g: revenueGrowth(c) })).filter((x) => x.g).sort((a, b) => b.g!.change - a.g!.change);
  if (rows.length < 2) return null;
  const top = rows[0];
  return `${top.n} grew revenue the most: ${formatMoneyShort(top.g!.from)} to ${formatMoneyShort(top.g!.to)} (${top.g!.change >= 0 ? '+' : ''}${pct(top.g!.change)}).`;
}

// ---- By year -----------------------------------------------------------------
/** Financial years present, newest first ("2025", "2024"...), named by the
 *  calendar year the accounting period ends in. */
export function financialYears(clubs: ComparisonClub[]): string[] {
  return [...new Set(clubs.flatMap((c) => c.periods.map((p) => p.period_end.slice(0, 4))))].sort().reverse();
}

/** Each club's period for a financial year ("latest" = its most recent);
 *  clubs without accounts for that year are returned separately. */
export function forYear(clubs: ComparisonClub[], year: string): { view: ComparisonClub[]; missing: string[] } {
  if (year === 'latest') return { view: clubs, missing: [] };
  const view: ComparisonClub[] = [], missing: string[] = [];
  for (const c of clubs) {
    const p = c.periods.find((x) => x.period_end.startsWith(year));
    if (p) view.push({ ...c, latest: p }); else missing.push(c.team.display_name);
  }
  view.sort((a, b) => (money(b.latest, 'revenue_total') ?? -1) - (money(a.latest, 'revenue_total') ?? -1));
  return { view, missing };
}

export type RaceMetric = 'revenue_total' | 'staff_costs' | 'cash' | 'borrowings';
export const RACE_METRICS: { key: RaceMetric; label: string }[] = [
  { key: 'revenue_total', label: 'Revenue' },
  { key: 'staff_costs', label: 'Wages' },
  { key: 'cash', label: 'Cash' },
  { key: 'borrowings', label: 'Borrowings' },
];

/** One frame of the timelapse: clubs ranked by the metric in that year.
 *  Clubs with nothing disclosed that year are left out of the frame. */
export function raceFrame(clubs: ComparisonClub[], metric: RaceMetric, year: string) {
  return clubs
    .map((c) => { const p = c.periods.find((x) => x.period_end.startsWith(year)); return { club: c, v: p ? money(p, metric) : null, comparable: p ? p.is_comparable : true }; })
    .filter((r): r is { club: ComparisonClub; v: number; comparable: boolean } => r.v != null)
    .sort((a, b) => b.v - a.v);
}

/** The largest value across ALL years, so the scale stays fixed and growth shows. */
export function raceMax(clubs: ComparisonClub[], metric: RaceMetric): number {
  return Math.max(1, ...clubs.flatMap((c) => c.periods.map((p) => money(p, metric) ?? 0)));
}
