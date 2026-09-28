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
import { getLeagueNameForSeason } from './referenceApi';

export type MatchPagePrediction = {
  fixture_id: number;
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
  /** Score published by the fixture feed before the result is confirmed
   * (fixtures.reported_*). Shown as provisional. */
  reported_home_goals?: number | null;
  reported_away_goals?: number | null;
  /** The betting market's view: market-average pre-match odds, bookmaker
   * margin removed (fixture_market_latest). Null when no price was captured
   * before kick-off. */
  market?: MarketLine | null;
  /** How the model and the market's closing line have compared on played
   * matches in this league (model_vs_market_by_league). */
  marketRecord?: MarketRecord | null;
};

export type MarketLine = { home: number; draw: number; away: number; captured_at: string };
export type MarketRecord = { matches: number; from_date: string; model_log_loss: number; market_log_loss: number };

/** Minimum played matches before the page states which has been more accurate. */
export const MARKET_RECORD_MIN_MATCHES = 100;

/** The plain-English comparison under the table, or null when there is too
 * little evidence to say. */
export function marketRecordSentence(r: MarketRecord | null | undefined, leagueName: string): string | null {
  if (!r || r.matches < MARKET_RECORD_MIN_MATCHES) return null;
  const since = new Date(`${r.from_date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const m = r.model_log_loss.toFixed(3);
  const k = r.market_log_loss.toFixed(3);
  const who = r.market_log_loss < r.model_log_loss ? 'the betting market has been more accurate than this model' : 'this model has been at least as accurate as the betting market';
  return `Across ${r.matches.toLocaleString('en-GB')} ${leagueName} matches since ${since}, ${who} (average log loss ${k} for the market's closing odds, ${m} for the model; lower is better).`;
}

async function getMarket(fixtureId: number, leagueId: number): Promise<{ market: MarketLine | null; marketRecord: MarketRecord | null }> {
  const [line, record] = await Promise.all([
    supabase.from('fixture_market_latest' as never).select('market_home, market_draw, market_away, captured_at').eq('fixture_id', fixtureId).maybeSingle(),
    supabase.from('model_vs_market_by_league' as never).select('matches, from_date, model_log_loss, market_log_loss').eq('league_id', leagueId).maybeSingle(),
  ]);
  const l = (line.error ? null : line.data) as { market_home: number; market_draw: number; market_away: number; captured_at: string } | null;
  const r = (record.error ? null : record.data) as { matches: number; from_date: string; model_log_loss: number; market_log_loss: number } | null;
  return {
    market: l ? { home: Number(l.market_home), draw: Number(l.market_draw), away: Number(l.market_away), captured_at: l.captured_at } : null,
    marketRecord: r ? { matches: Number(r.matches), from_date: r.from_date, model_log_loss: Number(r.model_log_loss), market_log_loss: Number(r.market_log_loss) } : null,
  };
}

/** Builds the outcome probabilities and score grid from a fixture's OWN
 * frozen expected goals.
 *
 * Exported so the static generator renders identical numbers to the
 * browser: this is the single place the technique lives, rather than
 * two copies that could silently drift apart.
 *
 * Reuses calculateDixonColes rather than reimplementing the low-score
 * correction and score grid. That function derives lambdas from ratings
 * (exp(homeAdvantage + attack - defence)), but here they're already
 * fixed by the stored prediction -- so feeding it log-lambdas with
 * zeroed home advantage and defence makes it reproduce those exact
 * expected goals rather than re-deriving possibly-different ones from
 * today's ratings: exp(0 + ln(lambdaHome) - 0) === lambdaHome. */
export function buildModelFromLambdas(lambdaHome: number, lambdaAway: number, rho: number): DixonColesResult {
  return calculateDixonColes({
    homeAttack: Math.log(lambdaHome),
    homeDefence: 0,
    awayAttack: Math.log(lambdaAway),
    awayDefence: 0,
    rho,
    homeAdvantage: 0,
  });
}

export async function getMatchBySlug(slug: string): Promise<MatchPagePrediction | null> {
  const { data, error } = await supabase
    .from('fixtures')
    // Must be a single string LITERAL: supabase-js parses the select at
    // the type level, and string concatenation defeats that, collapsing
    // every embedded column to GenericStringError.
    .select(
      'fixture_id, slug, kickoff_date, status, matchweek, league_id, season_id, home_team_id, away_team_id, predicted_home_goals, predicted_away_goals, predicted_at, prediction_fit_run_id, reported_home_goals, reported_away_goals, home_team:teams!fixtures_home_team_id_fkey(display_name, slug), away_team:teams!fixtures_away_team_id_fkey(display_name, slug), leagues(name)'
    )
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const lambdaHome = data.predicted_home_goals != null ? Number(data.predicted_home_goals) : null;
  const lambdaAway = data.predicted_away_goals != null ? Number(data.predicted_away_goals) : null;

  let model: DixonColesResult | null = null;
  if (lambdaHome != null && lambdaAway != null && data.prediction_fit_run_id != null) {
    const { data: fitRun, error: fitError } = await supabase
      .from('model_fit_runs')
      .select('rho')
      .eq('fit_run_id', data.prediction_fit_run_id)
      .maybeSingle();
    if (fitError) throw fitError;

    if (fitRun) {
      model = buildModelFromLambdas(lambdaHome, lambdaAway, Number(fitRun.rho));
    }
  }

  // The division's name in the fixture's season (e.g. First Division before
  // 2004/05); today's name if that lookup fails or has nothing.
  const leagueName = await getLeagueNameForSeason(data.league_id, data.season_id).catch(() => null);

  let actualHome: number | null = null;
  let actualAway: number | null = null;
  if (data.status === 'played') {
    const { data: match, error: matchError } = await supabase
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
    fixture_id: data.fixture_id,
    slug: data.slug,
    home_team_name: data.home_team?.display_name ?? 'Unknown',
    away_team_name: data.away_team?.display_name ?? 'Unknown',
    home_team_slug: data.home_team?.slug ?? null,
    away_team_slug: data.away_team?.slug ?? null,
    kickoff_date: data.kickoff_date,
    status: data.status,
    matchweek: data.matchweek,
    league_name: leagueName ?? data.leagues?.name ?? 'Unknown',
    predicted_home_goals: lambdaHome,
    predicted_away_goals: lambdaAway,
    predicted_at: data.predicted_at,
    fit_run_id: data.prediction_fit_run_id,
    model,
    actual_home_goals: actualHome,
    actual_away_goals: actualAway,
    reported_home_goals: data.reported_home_goals,
    reported_away_goals: data.reported_away_goals,
    ...(await getMarket(data.fixture_id, data.league_id).catch(() => ({ market: null, marketRecord: null }))),
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

/** Derived markets from a fixture's frozen expected goals.
 *
 * Over/under and both-teams-to-score fall straight out of the score
 * grid the model already produces -- no extra modelling, and they're
 * what people actually ask about a fixture beyond the scoreline.
 * Computed from the SAME grid as the outcome probabilities, so the
 * numbers on a page can't disagree with each other. */
export type DerivedMarkets = {
  overTwoFive: number;
  underTwoFive: number;
  bothScore: number;
  homeCleanSheet: number;
  awayCleanSheet: number;
};

export function derivedMarkets(model: DixonColesResult): DerivedMarkets {
  let over = 0;
  let btts = 0;
  let homeCS = 0;
  let awayCS = 0;
  for (let h = 0; h < model.scoreGrid.length; h++) {
    for (let a = 0; a < model.scoreGrid[h].length; a++) {
      const p = model.scoreGrid[h][a];
      if (h + a > 2.5) over += p;
      if (h > 0 && a > 0) btts += p;
      if (a === 0) homeCS += p;
      if (h === 0) awayCS += p;
    }
  }
  // The grid is truncated at a maximum scoreline, so it sums to slightly
  // under 1. Normalising keeps "over" and "under" adding to 100 rather
  // than 99.4, which looks like a bug even though it isn't.
  const total = model.scoreGrid.reduce((s, row) => s + row.reduce((t, v) => t + v, 0), 0) || 1;
  return {
    overTwoFive: (over / total) * 100,
    underTwoFive: ((total - over) / total) * 100,
    bothScore: (btts / total) * 100,
    homeCleanSheet: (homeCS / total) * 100,
    awayCleanSheet: (awayCS / total) * 100,
  };
}
