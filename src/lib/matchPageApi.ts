// ============================================================================
// src/lib/matchPageApi.ts
//
// Data for the canonical public match page (/football/matches/:slug).
//
// Distinct from MatchPreview's data layer, which builds an exploratory
// "pick any two teams and compare them" view from query-string state.
// This page is the opposite: one specific, real fixture at a stable,
// citable URL, showing the prediction THAT FIXTURE actually carries.
//
// Critically, this reads the prediction frozen on the fixture row
// (predicted_home_goals/away_goals + prediction_fit_run_id), not a
// freshly-recomputed one from the latest model fit. Those differ once a
// match is played: backfill_fixture_predictions() deliberately never
// touches a played fixture, so the stored values remain a genuine
// pre-kickoff forecast. Recomputing here would quietly turn every
// historical prediction into hindsight and destroy the one thing that
// makes this data worth citing.
// ============================================================================

import { supabase } from './supabase';
import { calculateDixonColes, type DixonColesResult } from './dixonColes';

export type MatchPagePrediction = {
  slug: string;
  home_team_name: string;
  away_team_name: string;
  home_team_slug: string | null;
  away_team_slug: string | null;
  kickoff_date: string;
  status: string;
  matchweek: number | null;
  league_name: string;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
  predicted_at: string | null;
  fit_run_id: number | null;
  /** Outcome probabilities and the full score grid, derived from the
   * fixture's own frozen expected goals. Null when the fixture has no
   * stored prediction (e.g. a team with no rating at the time). */
  model: DixonColesResult | null;
  /** Real result, once played. */
  actual_home_goals: number | null;
  actual_away_goals: number | null;
};

export async function getMatchBySlug(slug: string): Promise<MatchPagePrediction | null> {
  const { data, error } = await (supabase as any)
    .from('fixtures')
    .select(
      'fixture_id, slug, kickoff_date, status, matchweek, home_team_id, away_team_id, predicted_home_goals, predicted_away_goals, predicted_at, prediction_fit_run_id, ' +
        'home_team:teams!fixtures_home_team_id_fkey(display_name, slug), away_team:teams!fixtures_away_team_id_fkey(display_name, slug), leagues(name)'
    )
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const lambdaHome = data.predicted_home_goals != null ? Number(data.predicted_home_goals) : null;
  const lambdaAway = data.predicted_away_goals != null ? Number(data.predicted_away_goals) : null;

  let model: DixonColesResult | null = null;
  if (lambdaHome != null && lambdaAway != null && data.prediction_fit_run_id != null) {
    const { data: fitRun, error: fitError } = await (supabase as any)
      .from('model_fit_runs')
      .select('rho')
      .eq('fit_run_id', data.prediction_fit_run_id)
      .maybeSingle();
    if (fitError) throw fitError;

    if (fitRun) {
      // Reuses calculateDixonColes rather than reimplementing the
      // low-score correction and score grid here -- duplicated
      // probability maths that could silently drift from the real
      // model is exactly what this page must not have.
      //
      // That function derives its lambdas from ratings
      // (exp(homeAdvantage + attack - defence)), but here the lambdas
      // are already fixed by the frozen prediction. Feeding it
      // log-lambdas with zeroed home advantage and defence makes it
      // reproduce those exact expected goals rather than re-deriving
      // possibly-different ones from today's ratings:
      //   exp(0 + ln(lambdaHome) - 0) === lambdaHome
      model = calculateDixonColes({
        homeAttack: Math.log(lambdaHome),
        homeDefence: 0,
        awayAttack: Math.log(lambdaAway),
        awayDefence: 0,
        rho: Number(fitRun.rho),
        homeAdvantage: 0,
      });
    }
  }

  let actualHome: number | null = null;
  let actualAway: number | null = null;
  if (data.status === 'played') {
    const { data: match, error: matchError } = await (supabase as any)
      .from('matches')
      .select('full_time_home_goals, full_time_away_goals')
      .eq('home_team_id', data.home_team_id)
      .eq('away_team_id', data.away_team_id)
      .eq('match_date', data.kickoff_date)
      .maybeSingle();
    if (matchError) throw matchError;
    if (match) {
      actualHome = match.full_time_home_goals;
      actualAway = match.full_time_away_goals;
    }
  }

  return {
    slug: data.slug,
    home_team_name: data.home_team?.display_name ?? 'Unknown',
    away_team_name: data.away_team?.display_name ?? 'Unknown',
    home_team_slug: data.home_team?.slug ?? null,
    away_team_slug: data.away_team?.slug ?? null,
    kickoff_date: data.kickoff_date,
    status: data.status,
    matchweek: data.matchweek,
    league_name: data.leagues?.name ?? 'Unknown',
    predicted_home_goals: lambdaHome,
    predicted_away_goals: lambdaAway,
    predicted_at: data.predicted_at,
    fit_run_id: data.prediction_fit_run_id,
    model,
    actual_home_goals: actualHome,
    actual_away_goals: actualAway,
  };
}

/** The most likely exact scoreline from the model's score grid. */
export function mostLikelyScore(model: DixonColesResult): { home: number; away: number; probability: number } {
  let best = { home: 0, away: 0, probability: -1 };
  for (let h = 0; h < model.scoreGrid.length; h++) {
    for (let a = 0; a < model.scoreGrid[h].length; a++) {
      if (model.scoreGrid[h][a] > best.probability) best = { home: h, away: a, probability: model.scoreGrid[h][a] };
    }
  }
  return best;
}
