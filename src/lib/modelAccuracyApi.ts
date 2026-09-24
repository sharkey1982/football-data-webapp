// ============================================================================
// src/lib/modelAccuracyApi.ts
//
// How the model has actually performed on predictions it MADE -- every
// fixture whose expected goals were frozen before kickoff.
//
// This is deliberately not a backtest: it answers the narrower question
// "did our live predictions work", on a small sample that grows every week
// and only reflects today's settings. The walk-forward backtest (refit at
// each historical point, project forward, score against the closing market)
// is a separate, larger exercise -- see src/lib/scorecardApi.ts -- and both
// are shown together on ModelAccuracyPage.
// ============================================================================

import { supabase } from './supabase';

export type ModelAccuracySummary = {
  fixtures: number;
  correct: number;
  hit_rate: number;
  /** Always picking the home team. Home advantage alone is a strong
   * predictor, so this -- not 33% -- is the bar worth clearing. */
  always_home_hit_rate: number;
  model_brier: number;
  /** A model that always says 33.3/33.3/33.3 scores 0.6667. */
  uniform_brier: number;
  /** Mean probability the model assigned to the outcome that occurred. */
  mean_p_actual: number;
};

export type CalibrationBand = {
  band: string;
  forecasts: number;
  mean_predicted: number;
  actual_rate: number;
  gap: number;
};

export type AccuracyFixture = {
  fixture_id: number;
  league_code: string;
  kickoff_date: string;
  home_team: string;
  away_team: string;
  p_home: number;
  p_draw: number;
  p_away: number;
  picked: string;
  actual: string;
  correct: boolean;
  p_actual: number;
  brier: number;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

export async function getModelAccuracySummary(leagueId?: number): Promise<ModelAccuracySummary | null> {
  const { data, error } = await supabase.rpc('get_model_accuracy_summary', { p_league_id: leagueId ?? undefined });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    fixtures: n(row.fixtures),
    correct: n(row.correct),
    hit_rate: n(row.hit_rate),
    always_home_hit_rate: n(row.always_home_hit_rate),
    model_brier: n(row.model_brier),
    uniform_brier: n(row.uniform_brier),
    mean_p_actual: n(row.mean_p_actual),
  };
}

export async function getModelCalibration(leagueId?: number): Promise<CalibrationBand[]> {
  const { data, error } = await supabase.rpc('get_model_calibration', { p_league_id: leagueId ?? undefined });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    band: String(r.band),
    forecasts: n(r.forecasts),
    mean_predicted: n(r.mean_predicted),
    actual_rate: n(r.actual_rate),
    gap: n(r.gap),
  }));
}

export async function getModelAccuracyFixtures(leagueId?: number): Promise<AccuracyFixture[]> {
  const { data, error } = await supabase.rpc('get_model_accuracy', { p_league_id: leagueId ?? undefined });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    fixture_id: n(r.fixture_id),
    league_code: String(r.league_code),
    kickoff_date: String(r.kickoff_date),
    home_team: String(r.home_team),
    away_team: String(r.away_team),
    p_home: n(r.p_home),
    p_draw: n(r.p_draw),
    p_away: n(r.p_away),
    picked: String(r.picked),
    actual: String(r.actual),
    correct: Boolean(r.correct),
    p_actual: n(r.p_actual),
    brier: n(r.brier),
  }));
}

/** A band is only worth drawing conclusions from once it holds enough
 * forecasts. The tails here sit on ~10 each, where a couple of results
 * swing the rate by 20 points. */
export const MIN_BAND_FOR_CONFIDENCE = 50;
