// ============================================================================
// src/lib/bettingApi.ts
//
// What the model's predictions would have returned as bets.
//
// A bet is placed when the model's probability beats the price's implied
// probability (1/odds) by the chosen edge. The comparison uses the RAW
// implied probability, margin included -- the bookmaker's ~5% cut is exactly
// what a bettor has to beat.
// ============================================================================

import { supabase } from './supabase';

export type BettingMarket = '1x2' | 'ou25';

export type BettingReturnRow = {
  selection: string;
  bets: number;
  staked: number;
  returned: number;
  profit: number;
  roi_pct: number;
  wins: number;
  hit_rate_pct: number;
  avg_odds: number;
  avg_edge_pct: number;
};

export type BettingOptions = {
  edge: number;
  market: BettingMarket;
  closing: boolean;
  bestPrice: boolean;
  stake?: number;
  seasonId?: number;
};

export async function getBettingReturns(o: BettingOptions): Promise<BettingReturnRow[]> {
  const { data, error } = await supabase.rpc('get_betting_returns', {
    p_edge: o.edge,
    p_market: o.market,
    p_closing: o.closing,
    p_best_price: o.bestPrice,
    p_stake: o.stake ?? 10,
    p_season_id: o.seasonId ?? 13,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    selection: String(r.selection ?? ''),
    bets: Number(r.bets ?? 0),
    staked: Number(r.staked ?? 0),
    returned: Number(r.returned ?? 0),
    profit: Number(r.profit ?? 0),
    roi_pct: Number(r.roi_pct ?? 0),
    wins: Number(r.wins ?? 0),
    hit_rate_pct: Number(r.hit_rate_pct ?? 0),
    avg_odds: Number(r.avg_odds ?? 0),
    avg_edge_pct: Number(r.avg_edge_pct ?? 0),
  }));
}

export type BettingTotals = { bets: number; staked: number; profit: number; roiPct: number | null };

export function totalReturns(rows: BettingReturnRow[]): BettingTotals {
  const bets = rows.reduce((t, r) => t + r.bets, 0);
  const staked = rows.reduce((t, r) => t + r.staked, 0);
  const profit = rows.reduce((t, r) => t + r.profit, 0);
  return { bets, staked, profit, roiPct: staked > 0 ? (100 * profit) / staked : null };
}

/** Under ~500 bets a flat-stakes record says almost nothing against a
 *  bookmaker's margin, so the page says so rather than implying a verdict. */
export function sampleIsThin(bets: number): boolean {
  return bets < 500;
}
