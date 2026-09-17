// ============================================================================
// src/lib/landingApi.ts
//
// Small, purpose-built queries for the landing page and the two theme hub
// pages -- deliberately separate from api.ts/fplApi.ts (football-only and
// FPL-only respectively) since this spans both.
//
// Trivia rebuilt again after direct feedback: answers needed more context
// (a percentage of the total, and what came second, rather than a bare
// count) and the experience needed real stakes -- multiple-choice guessing
// rather than a plain reveal. Every option offered is a genuine alternative
// candidate pulled from the same query (the other actual top scorelines,
// the other actual highest-scoring matches, etc.) -- never an invented
// distractor -- so a correct guess still teaches something true about the
// runners-up.
// ============================================================================

import { supabase } from './supabase';

const PL_LEAGUE_ID = 1;
const PL_SEASON_ID = 13;

export type TriviaFact = {
  question: string;
  /** Real candidates, one of which is correct. Order is shuffled so the
   * correct one isn't predictably first (it's always first out of the
   * underlying "ORDER BY ... DESC" query otherwise). */
  options: string[];
  correctIndex: number;
  /** Shown once a person has guessed, right or wrong -- the actual figure,
   * always with enough context (a percentage, what came second) to mean
   * something rather than being a bare number out of context. */
  explanation: string;
};

/** Fisher-Yates, returning a new array (and the moved position of a given
 * original index) rather than mutating in place. */
function shuffleWithIndex<T>(items: T[], trackIndex: number): { items: T[]; newIndex: number } {
  const arr = items.map((item, i) => ({ item, originalIndex: i }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { items: arr.map((a) => a.item), newIndex: arr.findIndex((a) => a.originalIndex === trackIndex) };
}

function formatPercent(part: number, total: number): string {
  return `${((part / total) * 100).toFixed(1)}%`;
}

export async function getMostCommonScorelineTrivia(): Promise<TriviaFact | null> {
  const { data } = await (supabase as any).rpc('get_most_common_scoreline', { p_league_id: PL_LEAGUE_ID });
  const rows = (data ?? []) as { home_goals: number; away_goals: number; occurrences: number; total_matches: number }[];
  if (rows.length === 0) return null;
  const labels = rows.map((r) => `${r.home_goals}\u2013${r.away_goals}`);
  const { items: options, newIndex } = shuffleWithIndex(labels, 0);
  const top = rows[0];
  const second = rows[1];
  const explanation = second
    ? `${labels[0]} \u2014 ${formatPercent(top.occurrences, top.total_matches)} of every match in the archive, just ahead of ${labels[1]} at ${formatPercent(second.occurrences, second.total_matches)}.`
    : `${labels[0]} \u2014 ${formatPercent(top.occurrences, top.total_matches)} of every match in the archive.`;
  return {
    question: 'Which scoreline shows up more than any other in Premier League history?',
    options,
    correctIndex: newIndex,
    explanation,
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
  const buckets = ['Under 2.0', '2.0\u20132.5', '2.5\u20133.0', 'Over 3.0'];
  const correctIndex = perGame < 2.0 ? 0 : perGame < 2.5 ? 1 : perGame < 3.0 ? 2 : 3;
  return {
    question: 'Roughly how many goals a game is this Premier League season averaging?',
    options: buckets,
    correctIndex,
    explanation: `${perGame.toFixed(2)} a game \u2014 ${totalGoals} goals across ${seasonRows.length} matches so far.`,
  };
}

export async function getHighestScoringMatchTrivia(): Promise<TriviaFact | null> {
  const { data: rows } = await supabase
    .from('matches')
    .select('home_team:teams!matches_home_team_id_fkey(canonical_name), away_team:teams!matches_away_team_id_fkey(canonical_name), full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  if (!rows || rows.length === 0) return null;
  const sorted = (rows as any[])
    .map((r) => ({ ...r, total: r.full_time_home_goals + r.full_time_away_goals }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
  if (sorted.length === 0) return null;
  // Fixture names only, no score -- showing the score in the options
  // would let someone spot the answer just by comparing numbers rather
  // than actually guessing.
  const labels = sorted.map((r) => `${r.home_team?.canonical_name ?? 'Unknown'} vs ${r.away_team?.canonical_name ?? 'Unknown'}`);
  const { items: options, newIndex } = shuffleWithIndex(labels, 0);
  const top = sorted[0];
  return {
    question: 'Which match has produced more goals than any other this season?',
    options,
    correctIndex: newIndex,
    explanation: `${top.home_team?.canonical_name ?? 'Unknown'} ${top.full_time_home_goals}\u2013${top.full_time_away_goals} ${top.away_team?.canonical_name ?? 'Unknown'} \u2014 ${top.total} goals.`,
  };
}

export async function getBiggestWinMarginTrivia(): Promise<TriviaFact | null> {
  const { data: rows } = await supabase
    .from('matches')
    .select('home_team:teams!matches_home_team_id_fkey(canonical_name), away_team:teams!matches_away_team_id_fkey(canonical_name), full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  if (!rows || rows.length === 0) return null;
  const sorted = (rows as any[])
    .map((r) => ({ ...r, margin: Math.abs(r.full_time_home_goals - r.full_time_away_goals) }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 4);
  if (sorted.length === 0) return null;
  const labels = sorted.map((r) => `${r.home_team?.canonical_name ?? 'Unknown'} vs ${r.away_team?.canonical_name ?? 'Unknown'}`);
  const { items: options, newIndex } = shuffleWithIndex(labels, 0);
  const top = sorted[0];
  return {
    question: 'Somebody got thumped by a bigger margin than anyone else this season. Who?',
    options,
    correctIndex: newIndex,
    explanation: `${top.home_team?.canonical_name ?? 'Unknown'} ${top.full_time_home_goals}\u2013${top.full_time_away_goals} ${top.away_team?.canonical_name ?? 'Unknown'} \u2014 a ${top.margin}-goal margin.`,
  };
}

export async function getBestDefenceTrivia(): Promise<TriviaFact | null> {
  const { data, error } = await (supabase as any).rpc('get_best_defence_rating', { p_league_id: PL_LEAGUE_ID });
  if (error) throw error;
  const rows = (data ?? []) as { canonical_name: string; goals_against_per_game: number }[];
  if (rows.length === 0) return null;
  const labels = rows.map((r) => r.canonical_name);
  const { items: options, newIndex } = shuffleWithIndex(labels, 0);
  const top = rows[0];
  const second = rows[1];
  const explanation = second
    ? `${top.canonical_name} \u2014 the model expects just ${Number(top.goals_against_per_game).toFixed(2)} goals against a game, just ahead of ${second.canonical_name} at ${Number(second.goals_against_per_game).toFixed(2)}.`
    : `${top.canonical_name} \u2014 the model expects them to concede just ${Number(top.goals_against_per_game).toFixed(2)} goals a game against a neutral opponent.`;
  return {
    question: 'Which Premier League team does the model rate as the toughest to score against?',
    options,
    correctIndex: newIndex,
    explanation,
  };
}

export async function getClosestMatchTrivia(): Promise<TriviaFact | null> {
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
    .from('fixtures')
    .select('home_team:teams!fixtures_home_team_id_fkey(canonical_name), away_team:teams!fixtures_away_team_id_fkey(canonical_name), predicted_home_goals, predicted_away_goals')
    .in('fixture_id', fixtureIds)
    .not('predicted_home_goals', 'is', null);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const sorted = (data as any[])
    .map((r) => ({ ...r, margin: Math.abs(r.predicted_home_goals - r.predicted_away_goals) }))
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 4);
  if (sorted.length === 0) return null;
  const labels = sorted.map((r) => `${r.home_team?.canonical_name ?? 'Unknown'} vs ${r.away_team?.canonical_name ?? 'Unknown'}`);
  const { items: options, newIndex } = shuffleWithIndex(labels, 0);
  const top = sorted[0];
  return {
    question: 'Which match this gameweek is the model genuinely torn on?',
    options,
    correctIndex: newIndex,
    explanation: `${top.home_team?.canonical_name ?? 'Unknown'} vs ${top.away_team?.canonical_name ?? 'Unknown'} \u2014 predicted ${Number(top.predicted_home_goals).toFixed(1)}\u2013${Number(top.predicted_away_goals).toFixed(1)}, the closest scoreline of the week.`,
  };
}

export type TopFplPick = {
  web_name: string;
  team_name: string;
  expected_fpl_points: number;
  matchweek: number;
};

/** The single highest-projected FPL player for the next gameweek --
 * scoped to the current default matchweek specifically (not just
 * "highest points across every stored gameweek"). Still used directly
 * by other parts of the app beyond trivia, so kept as its own function
 * returning one pick rather than folded into the trivia-shaped version. */
export async function getLandingTopFplPick(): Promise<TopFplPick | null> {
  const top4 = await getTopFplPicks();
  return top4[0] ?? null;
}

async function getTopFplPicks(): Promise<TopFplPick[]> {
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
  if (nextMatchweek == null) return [];
  const fixtureIds = (fixtureRows ?? []).filter((f: any) => f.matchweek === nextMatchweek).map((f: any) => f.fixture_id);
  if (fixtureIds.length === 0) return [];

  const { data, error } = await (supabase as any)
    .from('fpl_player_projections')
    .select('expected_fpl_points, fpl_players(web_name, canonical_team_id, teams(canonical_name))')
    .eq('model_version', 'leaguewide_v6')
    .eq('scenario_key', 'baseline')
    .in('fixture_id', fixtureIds)
    .order('expected_fpl_points', { ascending: false })
    .limit(4);
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    web_name: row.fpl_players?.web_name ?? 'Unknown',
    team_name: row.fpl_players?.teams?.canonical_name ?? '',
    expected_fpl_points: Number(row.expected_fpl_points),
    matchweek: nextMatchweek,
  }));
}

export async function getTopFplPickTrivia(): Promise<TriviaFact | null> {
  const rows = await getTopFplPicks();
  if (rows.length === 0) return null;
  const labels = rows.map((r) => r.web_name);
  const { items: options, newIndex } = shuffleWithIndex(labels, 0);
  const top = rows[0];
  const second = rows[1];
  const explanation = second
    ? `${top.web_name} (${top.team_name}) \u2014 ${top.expected_fpl_points.toFixed(1)} projected points for Gameweek ${top.matchweek}, just ahead of ${second.web_name} at ${second.expected_fpl_points.toFixed(1)}.`
    : `${top.web_name} (${top.team_name}) \u2014 ${top.expected_fpl_points.toFixed(1)} projected points for Gameweek ${top.matchweek}.`;
  return {
    question: 'One player is projected to outscore every other this gameweek. Who is it?',
    options,
    correctIndex: newIndex,
    explanation,
  };
}

export async function getTopActualFplScorerTrivia(): Promise<TriviaFact | null> {
  const { data, error } = await (supabase as any).rpc('get_top_actual_fpl_scorer', { p_season_id: PL_SEASON_ID });
  if (error) throw error;
  const rows = (data ?? []) as { web_name: string; total_points: number }[];
  if (rows.length === 0) return null;
  const labels = rows.map((r) => r.web_name);
  const { items: options, newIndex } = shuffleWithIndex(labels, 0);
  const top = rows[0];
  const second = rows[1];
  const explanation = second
    ? `${top.web_name} \u2014 ${top.total_points} points so far, just ahead of ${second.web_name} at ${second.total_points}.`
    : `${top.web_name} \u2014 ${top.total_points} points so far.`;
  return {
    question: 'Forget the projections \u2014 who\u2019s actually scored the most Fantasy points so far this season?',
    options,
    correctIndex: newIndex,
    explanation,
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
    safely(getBestDefenceTrivia),
    safely(getClosestMatchTrivia),
    safely(getTopFplPickTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}

export async function getFootballTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getMostCommonScorelineTrivia),
    safely(getBestDefenceTrivia),
    safely(getBiggestWinMarginTrivia),
    safely(getClosestMatchTrivia),
    safely(getGoalsPerGameTrivia),
    safely(getHighestScoringMatchTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}

export async function getFplTrivia(): Promise<TriviaFact[]> {
  const results = await Promise.all([
    safely(getTopFplPickTrivia),
    safely(getTopActualFplScorerTrivia),
    safely(getClosestMatchTrivia),
  ]);
  return results.filter((f): f is TriviaFact => f !== null);
}
