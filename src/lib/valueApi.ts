// ============================================================================
// src/lib/valueApi.ts
//
// Actual points per million -- what players HAVE returned per unit of
// cost.
//
// Factual, so this is Discover. The projected equivalent is a forecast
// and belongs in Predict: same arithmetic, different kind of claim, and
// conflating them is exactly the mistake that put Match Projections in
// Discover in the first place.
// ============================================================================

import { supabase } from './supabase';

export type ValueRow = {
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  team_name: string | null;
  position_label: string;
  price: number;
  total_points: number;
  points_per_million: number;
  minutes: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  ownership: number | null;
};

export async function getActualValueTable(seasonId = 13): Promise<ValueRow[]> {
  const { data, error } = await (supabase as any).rpc('get_actual_value_table', { p_season_id: seasonId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    price: Number(r.price),
    total_points: Number(r.total_points),
    points_per_million: Number(r.points_per_million),
    minutes: Number(r.minutes),
    goals: Number(r.goals),
    assists: Number(r.assists),
    clean_sheets: Number(r.clean_sheets),
    bonus: Number(r.bonus),
    ownership: r.ownership == null ? null : Number(r.ownership),
  }));
}
