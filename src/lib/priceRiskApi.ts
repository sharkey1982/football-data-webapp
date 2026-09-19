// ============================================================================
// src/lib/priceRiskApi.ts
//
// Transfer pressure, as a proxy for price-change risk.
//
// A FORECAST, which is why it lives in Predict while "what everyone's
// doing" stays in Discover. Same underlying numbers, different kind of
// claim -- the distinction that put Match Projections in the wrong
// section originally.
//
// The honest limitation: FPL's price-change threshold isn't published.
// It scales with ownership and resets each gameweek, and the algorithm
// is unknown. So this reports PRESSURE relative to a player's owner
// base rather than predicting a change. Net transfers alone would rank
// by popularity -- 20,000 net transfers is decisive for a 2%-owned
// player and noise for a 40%-owned one.
// ============================================================================

import { supabase } from './supabase';

export type PriceRisk = {
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  team_name: string | null;
  position_label: string;
  price: number;
  ownership: number;
  transfers_in: number;
  transfers_out: number;
  net_transfers: number;
  pressure: number;
  direction: 'rise' | 'fall' | 'steady';
};

export async function getPriceChangeRisk(seasonId = 13): Promise<PriceRisk[]> {
  const { data, error } = await (supabase as any).rpc('get_price_change_risk', { p_season_id: seasonId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    price: Number(r.price),
    ownership: Number(r.ownership),
    transfers_in: Number(r.transfers_in),
    transfers_out: Number(r.transfers_out),
    net_transfers: Number(r.net_transfers),
    pressure: Number(r.pressure),
  }));
}

/** Risk bands derived from today's own distribution rather than fixed
 * numbers.
 *
 * A hardcoded threshold goes stale: pressure scales with how much
 * transfer activity there is, which swings hugely around deadlines and
 * dies off mid-week. "High" therefore means the top decile of whatever
 * is happening now, which keeps the label meaningful in a quiet week as
 * well as a frantic one.
 *
 * Bands are computed over the ABSOLUTE pressure across both directions,
 * so a riser and a faller at the same magnitude get the same label. */
export type RiskBand = 'high' | 'medium' | 'low';

export function riskBands(rows: PriceRisk[]): { high: number; medium: number } {
  const sorted = rows.map((r) => Math.abs(r.pressure)).sort((a, b) => a - b);
  if (sorted.length === 0) return { high: Infinity, medium: Infinity };
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return { high: at(0.9), medium: at(0.8) };
}

export function bandOf(row: PriceRisk, bands: { high: number; medium: number }): RiskBand {
  const p = Math.abs(row.pressure);
  if (p >= bands.high) return 'high';
  if (p >= bands.medium) return 'medium';
  return 'low';
}
