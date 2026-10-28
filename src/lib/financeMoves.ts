// ============================================================================
// src/lib/financeMoves.ts
//
// Promotion and relegation, through the accounts. A "move" is two
// consecutive sets of accounts for one club whose seasons were played in
// different divisions (finance_period_divisions): the last season before the
// move against the first season after it. Pure functions only:
//   * only accounts in pounds (never converted, never mixed);
//   * only consecutive seasons -- a gap in the filings is not a move;
//   * NULL stays "not disclosed"; a change needs BOTH figures;
//   * medians leave out moves where either year is flagged not comparable
//     (13-month periods, scope switches, restatements), and say how many.
// ============================================================================

import type { ClubFinanceData, FinanceDivision, FinancePeriod, FinanceTeam } from './financeApi';
import { money, wageRatio } from './financeCompare';
import { scaled } from './financeFormat';

const change = (a: number | null, b: number | null) => (a == null || b == null || a <= 0 ? null : b / a - 1);

export const MOVES_DESCRIPTION =
  'What promotion and relegation do to a football club\u2019s accounts: revenue, wages and pre-tax result in the season before the move and the season after, from statutory accounts.';

export type MoveDirection = 'promoted' | 'relegated';

export type FinanceMove = {
  team: FinanceTeam;
  direction: MoveDirection;
  from: FinanceDivision;
  to: FinanceDivision;
  before: FinancePeriod;
  after: FinancePeriod;
  revenueBefore: number | null;
  revenueAfter: number | null;
  /** Fractional change in revenue (0.25 = +25%). Null unless both disclosed. */
  revenueChange: number | null;
  /** Fractional change in broadcast and league income. Null unless both disclosed. */
  broadcastChange: number | null;
  wagesBefore: number | null;
  wagesAfter: number | null;
  pbtBefore: number | null;
  pbtAfter: number | null;
  /** False when either year is flagged not comparable. */
  comparable: boolean;
};

const isGbp = (p: FinancePeriod) => (p.currency ?? 'GBP').toUpperCase() === 'GBP';

/** Months between two period ends (whole months, by calendar). */
function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.slice(0, 7).split('-').map(Number);
  const [yb, mb] = b.slice(0, 7).split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** Every promotion and relegation visible in one club's accounts. */
export function clubMoves(d: ClubFinanceData): FinanceMove[] {
  const ps = [...d.periods].filter(isGbp).sort((x, y) => x.period_end.localeCompare(y.period_end));
  const out: FinanceMove[] = [];
  for (let i = 1; i < ps.length; i++) {
    const before = ps[i - 1];
    const after = ps[i];
    const from = before.division;
    const to = after.division;
    if (!from || !to || from.league_slug === to.league_slug) continue;
    // Divisions must be on the same ladder (same country) to be up or down.
    if ((from.country ?? '') !== (to.country ?? '') || from.division_order === to.division_order) continue;
    // Consecutive seasons only: a missing year in between is not one move.
    const gap = monthsBetween(before.period_end, after.period_end);
    if (gap < 9 || gap > 15) continue;
    const rb = money(before, 'revenue_total');
    const ra = money(after, 'revenue_total');
    out.push({
      team: d.team,
      direction: to.division_order < from.division_order ? 'promoted' : 'relegated',
      from, to, before, after,
      revenueBefore: rb,
      revenueAfter: ra,
      revenueChange: rb == null || ra == null || rb <= 0 ? null : ra / rb - 1,
      broadcastChange: change(scaled(before.revenue_broadcast, before.unit_scale), scaled(after.revenue_broadcast, after.unit_scale)),
      wagesBefore: wageRatio(before),
      wagesAfter: wageRatio(after),
      pbtBefore: money(before, 'profit_before_tax'),
      pbtAfter: money(after, 'profit_before_tax'),
      comparable: before.is_comparable && after.is_comparable,
    });
  }
  return out;
}

/** All moves, most recent first, then by club name. */
export function allMoves(data: Iterable<ClubFinanceData>): FinanceMove[] {
  const out: FinanceMove[] = [];
  for (const d of data) out.push(...clubMoves(d));
  return out.sort((a, b) => b.after.period_end.localeCompare(a.after.period_end) || a.team.display_name.localeCompare(b.team.display_name));
}

export type MoveGroup = {
  key: string;          // "championship>premier-league"
  direction: MoveDirection;
  from: FinanceDivision;
  to: FinanceDivision;
  moves: FinanceMove[];
  /** Moves used for the medians (both years comparable). */
  comparableCount: number;
  medianRevenueChange: number | null;
  medianBroadcastChange: number | null;
  medianWagesBefore: number | null;
  medianWagesAfter: number | null;
  /** Clubs with a pre-tax loss in the season after, of those disclosed. */
  lossesAfter: { losses: number; of: number };
};

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const vals = (xs: (number | null)[]) => xs.filter((v): v is number => v != null);

/** Medians need at least this many comparable moves; fewer prints n/a. */
export const MIN_FOR_MEDIAN = 2;

/** Moves grouped by kind (from -> to), down the pyramid: relegations from
 *  the top first, then promotions into the top. */
export function groupMoves(moves: FinanceMove[]): MoveGroup[] {
  const by = new Map<string, FinanceMove[]>();
  for (const mv of moves) {
    const k = `${mv.from.league_slug}>${mv.to.league_slug}`;
    by.set(k, [...(by.get(k) ?? []), mv]);
  }
  const groups: MoveGroup[] = [...by.entries()].map(([key, ms]) => {
    const comp = ms.filter((m) => m.comparable);
    const enough = comp.length >= MIN_FOR_MEDIAN;
    const pbt = vals(ms.map((m) => m.pbtAfter));
    return {
      key,
      direction: ms[0].direction,
      from: ms[0].from,
      to: ms[0].to,
      moves: ms,
      comparableCount: comp.length,
      medianRevenueChange: enough ? median(vals(comp.map((m) => m.revenueChange))) : null,
      medianBroadcastChange: vals(comp.map((m) => m.broadcastChange)).length >= MIN_FOR_MEDIAN ? median(vals(comp.map((m) => m.broadcastChange))) : null,
      medianWagesBefore: enough ? median(vals(comp.map((m) => m.wagesBefore))) : null,
      medianWagesAfter: enough ? median(vals(comp.map((m) => m.wagesAfter))) : null,
      lossesAfter: { losses: pbt.filter((v) => v < 0).length, of: pbt.length },
    };
  });
  const top = (g: MoveGroup) => Math.min(g.from.division_order, g.to.division_order);
  return groups.sort((a, b) =>
    (a.from.country_order - b.from.country_order) || (top(a) - top(b)) ||
    (a.direction === b.direction ? 0 : a.direction === 'relegated' ? -1 : 1));
}

/** "the Premier League", "the Championship", but "League One" (no article). */
export function leagueWithArticle(name: string): string {
  return /^League (One|Two)$/.test(name) ? name : `the ${name}`;
}

/** One sentence for a group, written only from what the data supports. */
export function groupTakeaway(g: MoveGroup): string | null {
  if (g.medianRevenueChange == null) return null;
  const pct = Math.round(Math.abs(g.medianRevenueChange) * 100);
  const dir = g.medianRevenueChange >= 0 ? 'rose' : 'fell';
  const verb = g.direction === 'relegated' ? `dropping from ${leagueWithArticle(g.from.league_name)} to ${leagueWithArticle(g.to.league_name)}` : `going up from ${leagueWithArticle(g.from.league_name)} to ${leagueWithArticle(g.to.league_name)}`;
  return `After ${verb}, revenue ${dir} by a median ${pct}% (${g.comparableCount} comparable move${g.comparableCount === 1 ? '' : 's'}).`;
}
