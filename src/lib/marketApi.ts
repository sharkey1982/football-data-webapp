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
