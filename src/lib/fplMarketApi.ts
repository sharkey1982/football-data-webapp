// ============================================================================
// src/lib/fplMarketApi.ts
//
// Price and ownership movement from the daily FPL snapshots.
//
// Entirely factual -- what a player costs, how many managers own them,
// how that has moved. No model output, which is precisely what makes it
// Discover rather than Predict.
//
// Note the window is short by nature: snapshots began on 13 September,
// so trends thicken on their own as the season runs. The page states its
// own window rather than implying more history than exists.
// ============================================================================

import { supabase } from './supabase';

export type FplMover = {
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  team_name: string | null;
  position_label: string;
  price_now: number;
  price_change: number;
  ownership_now: number;
  ownership_change: number;
  transfers_in_event: number;
  transfers_out_event: number;
  status: string | null;
  news: string | null;
  from_date: string;
  to_date: string;
};

export async function getFplMarketMovers(days = 7): Promise<FplMover[]> {
  const { data, error } = await supabase.rpc('get_fpl_market_movers', { p_days: days });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    price_now: Number(r.price_now),
    price_change: Number(r.price_change),
    ownership_now: Number(r.ownership_now),
    ownership_change: Number(r.ownership_change),
    transfers_in_event: Number(r.transfers_in_event),
    transfers_out_event: Number(r.transfers_out_event),
  }));
}
