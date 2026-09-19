// ============================================================================
// src/lib/teamOfWeekApi.ts
//
// The week's actual best XI, and how much of it the model rated.
//
// The honest framing matters here. Low overlap is NOT evidence of a bad
// model: the perfect XI is by construction made of the week's outliers,
// and a projection is an average over outcomes, not a prediction that
// someone will haul. The interesting number is whether the model's
// preferred XI scored roughly what it projected -- that's calibration,
// and it's the claim the model actually makes.
// ============================================================================

import { supabase } from './supabase';

export type TotwPlayer = {
  fpl_event_id: number;
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  team_name: string | null;
  position_label: string;
  points: number;
  minutes: number;
  is_mandatory: boolean;
  goals: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
};

export type TotwComparison = {
  fpl_event_id: number;
  actual_xi_points: number;
  model_xi_actual_points: number;
  overlap_count: number;
  model_xi_projected: number;
  overlap_names: string[] | null;
};

export async function getTeamOfTheWeek(eventId?: number): Promise<TotwPlayer[]> {
  const { data, error } = await supabase.rpc('get_team_of_the_week', {
    // The SQL function declares p_event_id with DEFAULT NULL, so codegen
    // types it optional. Omitting it lets that default apply -- passing an
    // explicit null is what the removed cast was hiding.
    p_event_id: eventId,
    p_season_id: 13,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    points: Number(r.points),
    minutes: Number(r.minutes),
    goals: Number(r.goals ?? 0),
    assists: Number(r.assists ?? 0),
    clean_sheets: Number(r.clean_sheets ?? 0),
    bonus: Number(r.bonus ?? 0),
  }));
}

export async function getTotwVsModel(eventId?: number): Promise<TotwComparison | null> {
  const { data, error } = await supabase.rpc('get_totw_vs_model', {
    // The SQL function declares p_event_id with DEFAULT NULL, so codegen
    // types it optional. Omitting it lets that default apply -- passing an
    // explicit null is what the removed cast was hiding.
    p_event_id: eventId,
    p_season_id: 13,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    ...row,
    actual_xi_points: Number(row.actual_xi_points ?? 0),
    model_xi_actual_points: Number(row.model_xi_actual_points ?? 0),
    overlap_count: Number(row.overlap_count ?? 0),
    model_xi_projected: Number(row.model_xi_projected ?? 0),
  };
}

/** Gameweeks that actually have returns, newest first.
 *
 * Drives one page per gameweek instead of a single page that silently
 * means something different each week. A URL that changes under you
 * can't be linked to or indexed with confidence -- the same argument
 * that gave players and matches their own slugs.
 *
 * "Completed" means someone scored: rows exist for an upcoming gameweek
 * with zero points, so counting rows would call a gameweek finished
 * before it kicked off. */
export type CompletedGameweek = {
  fpl_event_id: number;
  players: number;
  total_points: number;
  best_score: number;
};

export async function getCompletedGameweeks(seasonId = 13): Promise<CompletedGameweek[]> {
  const { data, error } = await supabase.rpc('get_completed_gameweeks', { p_season_id: seasonId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fpl_event_id: Number(r.fpl_event_id),
    players: Number(r.players),
    total_points: Number(r.total_points),
    best_score: Number(r.best_score),
  }));
}

/** Top scorers of a gameweek, whether or not they made the XI.
 *
 * This is what the separate Gameweek Results page was for. Folded in
 * here because one substantial page per gameweek beats two thin ones
 * competing for the same search, and because the XI only makes sense
 * beside the players who just missed it. */
export async function getGameweekScorers(eventId: number, seasonId = 13, limit = 25) {
  const { data, error } = await supabase
    .from('fpl_player_gameweeks')
    .select('fpl_player_id, total_points, minutes, goals_scored, assists, clean_sheets, bonus, fpl_players!inner(web_name, slug, element_type, canonical_team_id)')
    .eq('season_id', seasonId)
    .eq('fpl_event_id', eventId)
    .order('total_points', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fpl_player_id: Number(r.fpl_player_id),
    web_name: r.fpl_players?.web_name ?? null,
    slug: r.fpl_players?.slug ?? null,
    element_type: Number(r.fpl_players?.element_type ?? 0),
    points: Number(r.total_points ?? 0),
    minutes: Number(r.minutes ?? 0),
    goals: Number(r.goals_scored ?? 0),
    assists: Number(r.assists ?? 0),
    clean_sheets: Number(r.clean_sheets ?? 0),
    bonus: Number(r.bonus ?? 0),
  }));
}
export type GameweekScorer = Awaited<ReturnType<typeof getGameweekScorers>>[number];
