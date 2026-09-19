// ============================================================================
// src/lib/seasonXiApi.ts
//
// The best XI a manager could have picked in August and never touched.
//
// Built at START-of-season prices, which is the point of the exercise:
// a squad with no transfers pays August's price. End-of-season prices
// would let you buy Gabriel at £7.3m -- a price his own 209 points
// created -- rather than the £6.0m you'd actually have paid.
// ============================================================================

import { supabase } from './supabase';

export type SeasonXiPlayer = {
  season_id: number;
  fpl_code: number;
  web_name: string;
  team_name: string | null;
  element_type: number;
  start_cost: number;
  total_points: number;
};

export const POS_LABEL: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export async function getSeasonBestXi(seasonId: number): Promise<SeasonXiPlayer[]> {
  const { data, error } = await supabase
    .from('season_best_xi')
    .select('*')
    .eq('season_id', seasonId)
    .order('element_type')
    .order('total_points', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    start_cost: Number(r.start_cost),
    total_points: Number(r.total_points),
    element_type: Number(r.element_type),
  }));
}

/** Season totals, for the surrounding context on the page. */
export async function getSeasonValueLeaders(seasonId: number, limit = 10) {
  const { data, error } = await supabase
    .from('fpl_player_season_totals')
    .select('fpl_code, web_name, element_type, start_cost, end_cost, total_points, minutes')
    .eq('season_id', seasonId)
    .gt('minutes', 900)
    .order('total_points', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      ...r,
      start_cost: Number(r.start_cost),
      end_cost: Number(r.end_cost),
      total_points: Number(r.total_points),
      // Value at the price you'd have PAID, not the price the season
      // created.
      pointsPerStartMillion: Number((Number(r.total_points) / (Number(r.start_cost) / 10)).toFixed(2)),
    }))
    .sort((a, b) => b.pointsPerStartMillion - a.pointsPerStartMillion)
    .slice(0, limit);
}
export type SeasonValueLeader = Awaited<ReturnType<typeof getSeasonValueLeaders>>[number];

/** Seasons that have a solved best XI, newest first.
 *
 * Driven by the data rather than a hardcoded list, so adding a season
 * is an insert rather than a code change. */
export type XiSeason = { season_id: number; slug: string; label: string; points: number; cost: number };

export async function getXiSeasons(): Promise<XiSeason[]> {
  const { data, error } = await supabase
    .from('season_best_xi')
    .select('season_id, total_points, start_cost, seasons!inner(slug, label)');
  if (error) throw error;
  const by = new Map<number, XiSeason>();
  for (const r of (data ?? [])) {
    const id = Number(r.season_id);
    const cur = by.get(id) ?? {
      season_id: id,
      slug: r.seasons?.slug ?? String(id),
      label: r.seasons?.label ?? String(id),
      points: 0,
      cost: 0,
    };
    cur.points += Number(r.total_points);
    cur.cost += Number(r.start_cost);
    by.set(id, cur);
  }
  return [...by.values()].sort((a, b) => b.season_id - a.season_id);
}

/** Pretty form of the dataset's season slug: "2025-26" -> "2025/26". */
export function seasonName(slug: string): string {
  return slug.replace('-', '/');
}
