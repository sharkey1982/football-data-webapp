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
