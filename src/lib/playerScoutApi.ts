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
  slug?: string | null;
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
  const { data, error } = await supabase.rpc('search_players', {
    p_query: query.trim(),
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    fpl_code: Number(r.fpl_code),
    element_type: Number(r.element_type),
    seasons_played: Number(r.seasons_played),
    career_points: Number(r.career_points),
  }));
}

export async function getPlayerCareer(fplCode: number): Promise<PlayerSeason[]> {
  const { data, error } = await supabase.rpc('get_player_career', { p_fpl_code: fplCode });
  if (error) throw error;
  return (data ?? []).map((r) => ({
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

export type PlayerIdentity = {
  fpl_code: number;
  slug: string;
  canonical_name: string;
  latest_web_name: string | null;
  latest_team: string | null;
  element_type: number;
  seasons_played: number;
  career_points: number;
  career_minutes: number;
  first_season: string | null;
  last_season: string | null;
  current_slug: string | null;
};

/** Resolve a player page from its stable slug.
 *
 * The slug lives on player_identity rather than fpl_players, so it
 * survives a transfer, a name change and a season rollover -- and
 * departed players have one at all, which the per-season slug can't
 * give them. */
export async function getPlayerBySlug(slug: string): Promise<PlayerIdentity | null> {
  const { data, error } = await supabase.rpc('get_player_by_slug', { p_slug: slug });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    ...row,
    fpl_code: Number(row.fpl_code),
    element_type: Number(row.element_type),
    seasons_played: Number(row.seasons_played),
    career_points: Number(row.career_points),
    career_minutes: Number(row.career_minutes),
  };
}

// ---------------------------------------------------------------------------
// Browsing
//
// Search-only assumed you already knew who you were looking for, which
// rather defeats "scouting". The list is filtered server-side so the
// page never pulls 662 rows to show 20.
// ---------------------------------------------------------------------------

export type ScoutListPlayer = {
  fpl_code: number;
  slug: string | null;
  fpl_player_id: number;
  web_name: string;
  full_name: string | null;
  team_name: string | null;
  team_id: number | null;
  element_type: number;
  now_cost: number | null;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  selected_by_percent: number | null;
  points_per_million: number | null;
  seasons_played: number;
};

export type ScoutFilters = {
  position?: number | null;
  teamId?: number | null;
  minMinutes?: number;
  search?: string;
  limit?: number;
};

export async function listScoutPlayers(f: ScoutFilters = {}): Promise<ScoutListPlayer[]> {
  const { data, error } = await (supabase as any).rpc('list_scout_players', {
    p_season_id: 13,
    p_position: f.position ?? null,
    p_team_id: f.teamId ?? null,
    p_min_minutes: f.minMinutes ?? 0,
    p_search: f.search ?? null,
    p_limit: f.limit ?? 100,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    fpl_code: Number(r.fpl_code),
    fpl_player_id: Number(r.fpl_player_id),
    element_type: Number(r.element_type),
    total_points: Number(r.total_points ?? 0),
    minutes: Number(r.minutes ?? 0),
    goals_scored: Number(r.goals_scored ?? 0),
    assists: Number(r.assists ?? 0),
    clean_sheets: Number(r.clean_sheets ?? 0),
    bonus: Number(r.bonus ?? 0),
    seasons_played: Number(r.seasons_played ?? 0),
    now_cost: r.now_cost == null ? null : Number(r.now_cost),
    selected_by_percent: r.selected_by_percent == null ? null : Number(r.selected_by_percent),
    points_per_million: r.points_per_million == null ? null : Number(r.points_per_million),
  }));
}

export type GameweekBreakdown = {
  gameweek: number;
  opponent: string | null;
  was_home: boolean;
  kickoff_date: string | null;
  minutes: number;
  total_points: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  saves: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_missed: number;
  penalties_saved: number;
  /** Pre-kickoff projection where one exists. Null for most early
   * gameweeks -- projections only began partway through the season, and
   * anything generated after kickoff isn't a forecast. */
  projected_points: number | null;
};

export async function getPlayerGameweekBreakdown(fplPlayerId: number): Promise<GameweekBreakdown[]> {
  const { data, error } = await (supabase as any).rpc('get_player_gameweek_breakdown', {
    p_fpl_player_id: fplPlayerId,
    p_season_id: 13,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    gameweek: Number(r.gameweek),
    minutes: Number(r.minutes ?? 0),
    total_points: Number(r.total_points ?? 0),
    goals_scored: Number(r.goals_scored ?? 0),
    assists: Number(r.assists ?? 0),
    clean_sheets: Number(r.clean_sheets ?? 0),
    goals_conceded: Number(r.goals_conceded ?? 0),
    bonus: Number(r.bonus ?? 0),
    bps: Number(r.bps ?? 0),
    saves: Number(r.saves ?? 0),
    yellow_cards: Number(r.yellow_cards ?? 0),
    red_cards: Number(r.red_cards ?? 0),
    own_goals: Number(r.own_goals ?? 0),
    penalties_missed: Number(r.penalties_missed ?? 0),
    penalties_saved: Number(r.penalties_saved ?? 0),
    projected_points: r.projected_points == null ? null : Number(r.projected_points),
  }));
}

/** FPL's own scoring, used to explain where a gameweek's points came
 * from. Appearance points are derived rather than stored. */
export function contributionParts(g: GameweekBreakdown, elementType: number): { label: string; points: number }[] {
  const goalPoints = elementType === 1 || elementType === 2 ? 6 : elementType === 3 ? 5 : 4;
  const parts: { label: string; points: number }[] = [];
  if (g.minutes > 0) parts.push({ label: 'Played', points: g.minutes >= 60 ? 2 : 1 });
  if (g.goals_scored) parts.push({ label: `${g.goals_scored} goal${g.goals_scored > 1 ? 's' : ''}`, points: g.goals_scored * goalPoints });
  if (g.assists) parts.push({ label: `${g.assists} assist${g.assists > 1 ? 's' : ''}`, points: g.assists * 3 });
  if (g.clean_sheets && (elementType === 1 || elementType === 2)) parts.push({ label: 'Clean sheet', points: 4 });
  if (g.clean_sheets && elementType === 3) parts.push({ label: 'Clean sheet', points: 1 });
  if (g.saves >= 3) parts.push({ label: `${g.saves} saves`, points: Math.floor(g.saves / 3) });
  if (g.bonus) parts.push({ label: 'Bonus', points: g.bonus });
  if (g.penalties_saved) parts.push({ label: 'Penalty saved', points: g.penalties_saved * 5 });
  if (g.goals_conceded >= 2 && (elementType === 1 || elementType === 2)) {
    parts.push({ label: `${g.goals_conceded} conceded`, points: -Math.floor(g.goals_conceded / 2) });
  }
  if (g.yellow_cards) parts.push({ label: 'Yellow card', points: -g.yellow_cards });
  if (g.red_cards) parts.push({ label: 'Red card', points: -3 * g.red_cards });
  if (g.own_goals) parts.push({ label: 'Own goal', points: -2 * g.own_goals });
  if (g.penalties_missed) parts.push({ label: 'Penalty missed', points: -2 * g.penalties_missed });
  return parts;
}
