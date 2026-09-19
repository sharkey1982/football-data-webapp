// ============================================================================
// src/lib/marketApi.ts
//
// Betting-market efficiency by division.
//
// Framed as market efficiency, NOT betting advice, and that distinction
// is deliberate rather than cosmetic. "The National League is priced
// least sharply" is an analytical claim about data; "back the draw in
// League Two" is a tip. The numbers are the same; the positioning
// determines what this site is, who it attracts, and which advertising
// and app-store rules apply to it.
//
// The odds themselves were already archived in source_match_rows -- they
// arrive in the same football-data.co.uk CSVs as the results.
// ============================================================================

import { supabase } from './supabase';

export type MarketEfficiencyRow = {
  league_code: string;
  league_name: string;
  market: string;
  matches: number;
  /** Sum of implied probabilities across the three outcomes. 1.05 means
   * the book is set to return roughly 95p per pound staked -- the
   * cleanest single measure of how expensive a market is, before any
   * judgement about outcomes. */
  overround: number;
  roi_favourite: number;
  roi_outsider: number;
  roi_home: number;
  roi_draw: number;
  roi_away: number;
};

export async function getMarketEfficiency(closing = true): Promise<MarketEfficiencyRow[]> {
  const { data, error } = await (supabase as any).rpc('get_market_efficiency', {
    p_bookmaker: 'Avg',
    p_closing: closing,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    matches: Number(r.matches),
    overround: Number(r.overround),
    roi_favourite: Number(r.roi_favourite),
    roi_outsider: Number(r.roi_outsider),
    roi_home: Number(r.roi_home),
    roi_draw: Number(r.roi_draw),
    roi_away: Number(r.roi_away),
  }));
}

/** Margin as a percentage -- an overround of 1.0429 is a 4.29% margin,
 * which is the form people actually quote. */
export function marginPct(overround: number): number {
  return Number(((overround - 1) * 100).toFixed(2));
}

/** Bookmaker margin by season -- the trend, not the snapshot.
 *
 * Worth surfacing because it contradicts the common assumption. Margins
 * are widely said to have compressed as online competition grew; across
 * this archive the average overround has RISEN since 2019/20. */
export type OverroundPoint = {
  season_label: string;
  league_code: string;
  matches: number;
  overround: number;
};

export async function getOverroundTrend(): Promise<OverroundPoint[]> {
  const { data, error } = await (supabase as any).rpc('get_overround_trend', { p_bookmaker: 'Avg' });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    matches: Number(r.matches),
    overround: Number(r.overround),
  }));
}

/** Pooled across divisions, weighted by matches -- a season's margin
 * shouldn't be the flat mean of five divisions of very different size. */
export function overroundBySeason(points: OverroundPoint[]): { season: string; margin: number; matches: number }[] {
  const bySeason = new Map<string, OverroundPoint[]>();
  for (const p of points) {
    if (!bySeason.has(p.season_label)) bySeason.set(p.season_label, []);
    bySeason.get(p.season_label)!.push(p);
  }
  return [...bySeason.entries()]
    .map(([season, list]) => {
      const matches = list.reduce((s, p) => s + p.matches, 0);
      const weighted = list.reduce((s, p) => s + p.overround * p.matches, 0) / (matches || 1);
      return { season, matches, margin: Number(((weighted - 1) * 100).toFixed(2)) };
    })
    .sort((a, b) => a.season.localeCompare(b.season));
}

/** Formats "2425" as "2024/25". */
export function seasonLabel(raw: string): string {
  if (raw.length !== 4) return raw;
  return `20${raw.slice(0, 2)}/${raw.slice(2)}`;
}
