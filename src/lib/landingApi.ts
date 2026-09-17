// ============================================================================
// src/lib/landingApi.ts
//
// Small, purpose-built queries for the landing page and the two theme hub
// pages -- deliberately separate from api.ts/fplApi.ts (football-only and
// FPL-only respectively) since this spans both. Each trivia fact is its
// own small function so different pages can compose different subsets
// (the top-level landing page mixes both themes; each hub page uses only
// its own theme's facts) without duplicating query logic.
// ============================================================================

import { supabase } from './supabase';

const PL_LEAGUE_ID = 1;
const PL_SEASON_ID = 13;

export type TriviaFact = { question: string; answer: string };

/** Most common scoreline across the whole archive, not just this season --
 * server-side aggregation (a small SQL function, GROUP BY + COUNT + LIMIT
 * 1) rather than fetching all ~4,600 matches client-side just to find one
 * number. */
export async function getMostCommonScorelineTrivia(): Promise<TriviaFact | null> {
  const { data } = await (supabase as any).rpc('get_most_common_scoreline', { p_league_id: PL_LEAGUE_ID });
  const top = (data ?? [])[0];
  if (!top) return null;
  return {
    question: 'What\u2019s the most common Premier League scoreline?',
    answer: `${top.home_goals}\u2013${top.away_goals} \u2014 it\u2019s happened ${top.occurrences} times across every match in the archive.`,
  };
}

export async function getGoalsPerGameTrivia(): Promise<TriviaFact | null> {
  const { data: seasonRows } = await supabase
    .from('matches')
    .select('full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  if (!seasonRows || seasonRows.length === 0) return null;
  const totalGoals = (seasonRows as any[]).reduce((sum, r) => sum + r.full_time_home_goals + r.full_time_away_goals, 0);
  const perGame = totalGoals / seasonRows.length;
  return {
    question: 'How many goals a game is this Premier League season averaging?',
    answer: `${perGame.toFixed(2)} \u2014 ${totalGoals} goals across ${seasonRows.length} matches so far.`,
  };
}

export async function getHighestScoringMatchTrivia(): Promise<TriviaFact | null> {
  const { data: rows } = await supabase
    .from('matches')
    .select('home_team:teams!matches_home_team_id_fkey(canonical_name), away_team:teams!matches_away_team_id_fkey(canonical_name), full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  if (!rows || rows.length === 0) return null;
  const top = (rows as any[]).reduce((best, r) => {
    const total = r.full_time_home_goals + r.full_time_away_goals;
    return total > best.total ? { ...r, total } : best;
  }, { total: -1 } as any);
  if (top.total < 0) return null;
  return {
    question: 'What\u2019s been the highest-scoring match this season?',
    answer: `${top.home_team?.canonical_name ?? 'Unknown'} ${top.full_time_home_goals}\u2013${top.full_time_away_goals} ${top.away_team?.canonical_name ?? 'Unknown'} \u2014 ${top.total} goals.`,
  };
}

export async function getBiggestWinMarginTrivia(): Promise<TriviaFact | null> {
  const { data: rows } = await supabase
    .from('matches')
    .select('home_team:teams!matches_home_team_id_fkey(canonical_name), away_team:teams!matches_away_team_id_fkey(canonical_name), full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  if (!rows || rows.length === 0) return null;
  const top = (rows as any[]).reduce((best, r) => {
    const margin = Math.abs(r.full_time_home_goals - r.full_time_away_goals);
    return margin > best.margin ? { ...r, margin } : best;
  }, { margin: -1 } as any);
  if (top.margin < 0) return null;
  return {
    question: 'What\u2019s been the biggest win margin this season?',
    answer: `${top.home_team?.canonical_name ?? 'Unknown'} ${top.full_time_home_goals}\u2013${top.full_time_away_goals} ${top.away_team?.canonical_name ?? 'Unknown'} \u2014 a ${top.margin}-goal margin.`,
  };
}

export type TopFplPick = {
  web_name: string;
  team_name: string;
  expected_fpl_points: number;
  matchweek: number;
};

/** The single highest-projected FPL player for the next gameweek that has
 * projections. Scoped to the current default matchweek specifically (not
 * just "highest points across every stored gameweek"), so this is
 * genuinely "next gameweek's top pick" rather than an arbitrary one from
 * whichever week happens to have the biggest number. */
export async function getLandingTopFplPick(): Promise<TopFplPick | null> {
  const { data: fixtureRows, error: fixtureError } = await supabase
    .from('fixtures')
    .select('fixture_id, matchweek')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID)
    .eq('status', 'scheduled')
    .order('kickoff_date', { ascending: true })
    .limit(10);
  if (fixtureError) throw fixtureError;
  const nextMatchweek = (fixtureRows ?? [])[0]?.matchweek;
  if (nextMatchweek == null) return null;
  const fixtureIds = (fixtureRows ?? []).filter((f: any) => f.matchweek === nextMatchweek).map((f: any) => f.fixture_id);
  if (fixtureIds.length === 0) return null;

  const { data, error } = await (supabase as any)
    .from('fpl_player_projections')
    .select('expected_fpl_points, fpl_players(web_name, canonical_team_id, teams(canonical_name))')
    .eq('model_version', 'leaguewide_v6')
    .eq('scenario_key', 'baseline')
    .in('fixture_id', fixtureIds)
    .order('expected_fpl_points', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as any;
  if (!row) return null;
  return {
    web_name: row.fpl_players?.web_name ?? 'Unknown',
    team_name: row.fpl_players?.teams?.canonical_name ?? '',
    expected_fpl_points: Number(row.expected_fpl_points),
    matchweek: nextMatchweek,
  };
}

export async function getTopFplPickTrivia(): Promise<TriviaFact | null> {
  const topPick = await getLandingTopFplPick();
  if (!topPick) return null;
  return {
    question: 'Who\u2019s projected for the most Fantasy points next gameweek?',
    answer: `${topPick.web_name} (${topPick.team_name}) \u2014 ${topPick.expected_fpl_points.toFixed(1)} projected points for Gameweek ${topPick.matchweek}.`,
  };
}

export async function getTopActualFplScorerTrivia(): Promise<TriviaFact | null> {
  const { data, error } = await (supabase as any).rpc('get_top_actual_fpl_scorer', { p_season_id: PL_SEASON_ID });
  if (error) throw error;
  const top = (data ?? [])[0];
  if (!top) return null;
  return {
    question: 'Who\u2019s actually scored the most Fantasy points this season?',
    answer: `${top.web_name} \u2014 ${top.total_points} points so far.`,
  };
}

/** Each function's own failure just means that one fact is skipped -- a
 * decorative feature degrading gracefully rather than blocking the page
 * shell is the right trade-off, so every call here is wrapped
 * individually rather than one try/catch around the whole batch. */
async function safely(fn: () => Promise<TriviaFact | null>): Promise<TriviaFact | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Mixed set for the top-level landing page, before a visitor has picked
 * a theme -- one taste of each. */
export async function getLandingTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getMostCommonScorelineTrivia),
    safely(getGoalsPerGameTrivia),
    safely(getHighestScoringMatchTrivia),
    safely(getTopFplPickTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}

export async function getFootballTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getMostCommonScorelineTrivia),
    safely(getGoalsPerGameTrivia),
    safely(getHighestScoringMatchTrivia),
    safely(getBiggestWinMarginTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}

export async function getFplTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getTopFplPickTrivia),
    safely(getTopActualFplScorerTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}
