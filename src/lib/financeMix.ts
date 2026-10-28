// ============================================================================
// src/lib/financeMix.ts
//
// Where clubs' money comes from (revenue mix) and how much they lean on
// selling players (player trading). Pure functions only:
//   * NULL stays "not disclosed"; a share needs the figures it divides;
//   * clubs label revenue differently, so a club is only in the revenue-mix
//     comparison when its turnover note splits out matchday, broadcast AND
//     commercial and the parts add up to turnover; the rest are listed by
//     name, never guessed;
//   * profit before tax already includes player-sale profit wherever the
//     club shows it, so "before player sales" = pre-tax result minus it.
// ============================================================================

import { scaled } from './financeFormat';
import type { FinancePeriod } from './financeApi';
import type { ComparisonClub } from './financeCompare';

const v = (p: FinancePeriod, k: keyof FinancePeriod) => scaled(p[k] as number | null, p.unit_scale);

export type RevenueMix = { matchday: number; broadcast: number; commercial: number; other: number; total: number };

/** Shares of revenue (0-1) by stream, or null when the split isn't usable:
 *  matchday, broadcast and commercial must all be disclosed and the parts
 *  must add up to turnover (within 1%, for rounding in the filing). */
export function revenueMix(p: FinancePeriod): RevenueMix | null {
  const total = v(p, 'revenue_total');
  const md = v(p, 'revenue_matchday'), bc = v(p, 'revenue_broadcast'), cm = v(p, 'revenue_commercial');
  const ot = v(p, 'revenue_other') ?? 0;
  if (total == null || total <= 0 || md == null || bc == null || cm == null) return null;
  const sum = md + bc + cm + ot;
  if (Math.abs(sum - total) > total * 0.01) return null;
  return { matchday: md / total, broadcast: bc / total, commercial: cm / total, other: ot / total, total };
}

export function mixClubs(clubs: ComparisonClub[]): { shown: { club: ComparisonClub; mix: RevenueMix }[]; unsplit: string[] } {
  const shown: { club: ComparisonClub; mix: RevenueMix }[] = [];
  const unsplit: string[] = [];
  for (const c of clubs) {
    const mix = revenueMix(c.latest);
    if (mix) shown.push({ club: c, mix }); else if (v(c.latest, 'revenue_total') != null) unsplit.push(c.team.display_name);
  }
  shown.sort((a, b) => b.mix.broadcast - a.mix.broadcast);
  return { shown, unsplit: unsplit.sort() };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function mixTakeaway(rows: { club: ComparisonClub; mix: RevenueMix }[]): string | null {
  if (rows.length < 2) return null;
  const hi = rows[0], lo = rows[rows.length - 1];
  return `${hi.club.team.display_name} take ${pct(hi.mix.broadcast)} of revenue from broadcasting and league payments; ${lo.club.team.display_name} ${pct(lo.mix.broadcast)}.`;
}

export type Trading = {
  club: ComparisonClub;
  sales: number;                 // profit on player sales (negative = a loss)
  amortisation: number | null;   // cost of players bought, spread over contracts
  pbt: number | null;
  /** Pre-tax result with the player-sale profit taken out. */
  pbtWithoutSales: number | null;
  /** Player-sale profit as a share of revenue. */
  salesShare: number | null;
};

/** Clubs that disclose profit on player sales, biggest first. */
export function tradingClubs(clubs: ComparisonClub[]): { shown: Trading[]; undisclosed: string[] } {
  const shown: Trading[] = [];
  const undisclosed: string[] = [];
  for (const c of clubs) {
    const p = c.latest;
    const sales = v(p, 'profit_on_player_disposals');
    if (sales == null) { undisclosed.push(c.team.display_name); continue; }
    const pbt = v(p, 'profit_before_tax');
    const rev = v(p, 'revenue_total');
    shown.push({
      club: c, sales,
      amortisation: v(p, 'player_amortisation'),
      pbt,
      pbtWithoutSales: pbt == null ? null : pbt - sales,
      salesShare: rev == null || rev <= 0 ? null : sales / rev,
    });
  }
  shown.sort((a, b) => b.sales - a.sales);
  return { shown, undisclosed: undisclosed.sort() };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Clubs whose pre-tax profit (or break-even) depended on selling players. */
export function tradingTakeaway(rows: Trading[]): string | null {
  const saved = rows.filter((t) => t.pbt != null && t.pbt >= 0 && t.pbtWithoutSales != null && t.pbtWithoutSales < 0).map((t) => t.club.team.display_name);
  if (saved.length) return `${list(saved)} made a pre-tax profit only because of player sales; without them ${saved.length === 1 ? 'it' : 'each'} would have made a loss.`;
  if (!rows.length) return null;
  const top = rows[0];
  return top.sales > 0 ? `${top.club.team.display_name} made the most from selling players.` : null;
}
