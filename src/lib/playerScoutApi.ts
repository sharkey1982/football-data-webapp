// ============================================================================
// src/lib/playerScoutApi.ts
//
// Player Scout: search any player, read what actually happened.
//
// The counterpart to Player Projections, which is about what the model
// expects. This only works because player_identity links the same human
// across seasons and clubs -- FPL reassigns element ids every year, so
// "Saka in 2022/23" and "Saka now" share no id, only a code.
// ============================================================================

import { supabase } from './supabase';

export type PlayerSearchResult = {
  fpl_code: number;
  canonical_name: string;
  latest_web_name: string | null;
  latest_team: string | null;
  element_type: number;
  seasons_played: number;
  career_points: number;
  first_season: string | null;
  last_season: string | null;
  /** Only current-season players have a projection page to link to. */
  current_slug: string | null;
};

export type PlayerSeason = {
  season_id: number;
  season_slug: string;
  web_name: string;
  team_name: string | null;
  element_type: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  points_per_start_million: number | null;
  points_early: number | null;
  points_mid: number | null;
  points_late: number | null;
};

export const POSITION: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export async function searchPlayers(query: string, limit = 20): Promise<PlayerSearchResult[]> {
  if (query.trim().length < 2) return [];
  const { data, error } = await (supabase as any).rpc('search_players', {
    p_query: query.trim(),
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    fpl_code: Number(r.fpl_code),
    element_type: Number(r.element_type),
    seasons_played: Number(r.seasons_played),
    career_points: Number(r.career_points),
  }));
}

export async function getPlayerCareer(fplCode: number): Promise<PlayerSeason[]> {
  const { data, error } = await (supabase as any).rpc('get_player_career', { p_fpl_code: fplCode });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    season_id: Number(r.season_id),
    element_type: Number(r.element_type),
    start_cost: Number(r.start_cost),
    end_cost: Number(r.end_cost),
    total_points: Number(r.total_points),
    minutes: Number(r.minutes),
    goals_scored: Number(r.goals_scored),
    assists: Number(r.assists),
    clean_sheets: Number(r.clean_sheets),
    bonus: Number(r.bonus),
    points_per_start_million: r.points_per_start_million == null ? null : Number(r.points_per_start_million),
    points_early: r.points_early == null ? null : Number(r.points_early),
    points_mid: r.points_mid == null ? null : Number(r.points_mid),
    points_late: r.points_late == null ? null : Number(r.points_late),
  }));
}

/** Pretty form of the dataset slug: "2025-26" -> "2025/26". */
export function seasonLabel(slug: string): string {
  return slug.replace('-', '/');
}
