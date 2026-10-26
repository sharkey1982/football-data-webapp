// ============================================================================
// src/lib/priceRiskApi.ts
//
// FPL price changes, from FPL's own predictor (26 Oct 2026).
//
// Since 2026/27 FPL's API publishes how far each player is towards his next
// price change (price_change_percent: +-100 = past the line, expected at the
// next overnight update) and a projection for its next update. Checked
// against what happened over 43 nights: +100% or more rose 48 of 48, -100% or
// less fell 248 of 251. The old ranking (net transfers / ownership) got 4% of
// its top-3 risers right, so it was replaced. These are FPL's estimates, not
// ours; the page shows their running record.
//
// get_price_change_risk keeps its old columns (pressure = FPL's progress %,
// direction its sign) because the FPL hub, player pages, scout table and
// trivia read it.
// ============================================================================

import { supabase } from './supabase';
import { getCurrentFplSeasonId } from './currentSeason';

/** expected: past +-100%. possible: FPL projects it past 100 by its next
 * update. close: 90-99%. building: 50-89%. calibrating: FPL says its figure
 * is still settling. */
export type PriceOutlook = 'expected' | 'possible' | 'close' | 'building' | 'calibrating';

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
  /** FPL's progress to the next change, in % (negative = towards a fall). */
  pressure: number;
  direction: 'rise' | 'fall' | 'steady';
  progress?: number;
  projected_next?: number | null;
  likelihood?: number | null;
  outlook?: PriceOutlook;
  updated_at?: string | null;
};

const num = (v: unknown) => (v == null ? null : Number(v));

export async function getPriceChangeRisk(seasonId?: number): Promise<PriceRisk[]> {
  const { data, error } = await supabase.rpc('get_price_change_risk', { p_season_id: seasonId ?? (await getCurrentFplSeasonId()) });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    price: Number(r.price),
    ownership: Number(r.ownership),
    transfers_in: Number(r.transfers_in),
    transfers_out: Number(r.transfers_out),
    net_transfers: Number(r.net_transfers),
    pressure: Number(r.pressure),
    progress: Number(r.progress ?? r.pressure),
    projected_next: num(r.projected_next),
    likelihood: num(r.likelihood),
  }));
}

export type PriceRecord = {
  from_night: string;
  to_night: string;
  nights: number;
  expected_rises: number;
  rose: number;
  expected_falls: number;
  fell: number;
  possible: number;
  possible_changed: number;
  rises: number;
  rises_expected: number;
  falls: number;
  falls_expected: number;
};

/** How often FPL's predictor was right over the last `days` nights. */
export async function getPriceRecord(days = 28): Promise<PriceRecord | null> {
  const { data, error } = await supabase.rpc('get_price_predictor_record', { p_season_id: await getCurrentFplSeasonId(), p_days: days });
  if (error) throw error;
  const r = (data ?? [])[0];
  if (!r || !r.nights) return null;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    from_night: r.from_night, to_night: r.to_night, nights: n(r.nights),
    expected_rises: n(r.expected_rises), rose: n(r.rose), expected_falls: n(r.expected_falls), fell: n(r.fell),
    possible: n(r.possible), possible_changed: n(r.possible_changed),
    rises: n(r.rises), rises_expected: n(r.rises_expected), falls: n(r.falls), falls_expected: n(r.falls_expected),
  };
}

export type PriceChange = {
  night: string;
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  team_name: string | null;
  position_label: string;
  price_before: number;
  price_after: number;
  ownership: number | null;
  progress: number | null;
};

/** Price changes on the most recent night we have recorded. */
export async function getRecentPriceChanges(nights = 1): Promise<PriceChange[]> {
  const { data, error } = await supabase.rpc('get_price_changes_recent', { p_season_id: await getCurrentFplSeasonId(), p_nights: nights });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    fpl_player_id: Number(r.fpl_player_id),
    price_before: Number(r.price_before),
    price_after: Number(r.price_after),
    ownership: num(r.ownership),
    progress: num(r.progress),
  }));
}

/** "103%", "-98%" (with a real minus sign). */
export function fmtProgress(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return '—';
  const v = Math.round(p);
  return `${v < 0 ? '−' : ''}${Math.abs(v)}%`;
}
