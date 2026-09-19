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

/** Value by position, using the players you'd ACTUALLY own rather than
 * the positional average.
 *
 * The distinction matters and changes the answer. Averaged across
 * everyone, the four positions look similar (medians 2.15-2.95 points
 * per million). Restricted to the best few in each position -- which is
 * who a squad is built from -- they diverge sharply, and that divergence
 * is what should drive formation choice.
 *
 * Squad rules are the reason this is actionable at all: an XI must field
 * 1 goalkeeper, 3-5 defenders, 2-5 midfielders and 1-3 forwards, so the
 * real question is where the FLEXIBLE slots go. */
export type PositionValue = {
  position: string;
  playersConsidered: number;
  topPointsPerMillion: number;
  topAveragePrice: number;
  topAveragePoints: number;
  bestPlayer: { name: string; slug: string | null; ppm: number; price: number } | null;
};

const POSITION_ORDER = ['GKP', 'DEF', 'MID', 'FWD'];

export function valueByPosition(rows: ValueRow[], topN = 5, minMinutes = 180): PositionValue[] {
  return POSITION_ORDER.map((position) => {
    const pool = rows
      .filter((r) => r.position_label === position && r.minutes >= minMinutes)
      .sort((a, b) => b.points_per_million - a.points_per_million);
    const top = pool.slice(0, topN);
    const mean = (pick: (r: ValueRow) => number) =>
      top.length ? top.reduce((s, r) => s + pick(r), 0) / top.length : 0;
    return {
      position,
      playersConsidered: pool.length,
      topPointsPerMillion: Number(mean((r) => r.points_per_million).toFixed(2)),
      topAveragePrice: Number(mean((r) => r.price).toFixed(2)),
      topAveragePoints: Number(mean((r) => r.total_points).toFixed(1)),
      bestPlayer: top[0]
        ? { name: top[0].web_name, slug: top[0].slug, ppm: top[0].points_per_million, price: top[0].price }
        : null,
    };
  }).filter((p) => p.playersConsidered > 0);
}
