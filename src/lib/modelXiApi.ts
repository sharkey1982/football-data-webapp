// ============================================================================
// src/lib/modelXiApi.ts
//
// The model's XI against the week's best XI, gameweek by gameweek.
//
// Two fields decide what a row MEANS, and the page must not hide them:
//   players_projected         the XI is only league-wide if the projections
//                             were; a 64-player week is a fragment
//   generated_before_deadline whether the projections pre-date the FPL
//                             deadline. If not, the XI was assembled after
//                             the week was played -- a retrospective fit,
//                             not a forecast.
// ============================================================================

import { supabase } from './supabase';

export type ModelXiWeek = {
  fpl_event_id: number;
  actual_xi_points: number;
  model_xi_actual_points: number;
  model_xi_projected: number;
  overlap_count: number;
  players_projected: number;
  generated_before_deadline: boolean;
  deadline_time: string;
};

export type ModelXiSummary = {
  weeks: ModelXiWeek[];
  /** Weeks whose projections pre-date the deadline: the only ones that test foresight. */
  forecastWeeks: ModelXiWeek[];
  meanModelPoints: number | null;
  meanPerfectPoints: number | null;
  meanProjected: number | null;
  /** Actual minus projected, averaged: is the model's own forecast calibrated? */
  meanCalibrationGap: number | null;
};

export async function getModelXiHistory(seasonId = 13, leagueId = 1): Promise<ModelXiWeek[]> {
  const { data, error } = await supabase.rpc('get_model_xi_history', {
    p_season_id: seasonId,
    p_league_id: leagueId,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    fpl_event_id: Number(r.fpl_event_id),
    actual_xi_points: Number(r.actual_xi_points ?? 0),
    model_xi_actual_points: Number(r.model_xi_actual_points ?? 0),
    model_xi_projected: Number(r.model_xi_projected ?? 0),
    overlap_count: Number(r.overlap_count ?? 0),
    players_projected: Number(r.players_projected ?? 0),
    generated_before_deadline: Boolean(r.generated_before_deadline),
    deadline_time: String(r.deadline_time ?? ''),
  }));
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summariseModelXi(weeks: ModelXiWeek[]): ModelXiSummary {
  const forecastWeeks = weeks.filter((w) => w.generated_before_deadline);
  return {
    weeks,
    forecastWeeks,
    meanModelPoints: mean(weeks.map((w) => w.model_xi_actual_points)),
    meanPerfectPoints: mean(weeks.map((w) => w.actual_xi_points)),
    meanProjected: mean(weeks.map((w) => w.model_xi_projected)),
    meanCalibrationGap: mean(weeks.map((w) => w.model_xi_actual_points - w.model_xi_projected)),
  };
}
