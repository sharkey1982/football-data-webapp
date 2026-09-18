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
  const { data, error } = await (supabase as any).rpc('get_team_of_the_week', {
    p_event_id: eventId ?? null,
    p_season_id: 13,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    points: Number(r.points),
    minutes: Number(r.minutes),
  }));
}

export async function getTotwVsModel(eventId?: number): Promise<TotwComparison | null> {
  const { data, error } = await (supabase as any).rpc('get_totw_vs_model', {
    p_event_id: eventId ?? null,
    p_season_id: 13,
  });
  if (error) throw error;
  const row = ((data ?? []) as any[])[0];
  if (!row) return null;
  return {
    ...row,
    actual_xi_points: Number(row.actual_xi_points ?? 0),
    model_xi_actual_points: Number(row.model_xi_actual_points ?? 0),
    overlap_count: Number(row.overlap_count ?? 0),
    model_xi_projected: Number(row.model_xi_projected ?? 0),
  };
}
