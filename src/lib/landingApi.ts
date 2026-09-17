// ============================================================================
// src/lib/landingApi.ts
//
// A handful of small, purpose-built queries for the landing page --
// deliberately separate from api.ts/fplApi.ts (which are football-only
// and FPL-only respectively) since this is genuinely a third concern: a
// landing-page-specific aggregate combining both.
// ============================================================================

import { supabase } from './supabase';

const PL_LEAGUE_ID = 1;
const PL_SEASON_ID = 13;

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

export type TriviaFact = { question: string; answer: string };

/** A handful of genuinely real, data-computed trivia facts for the landing
 * page's rotating callout -- requested directly ("what is the most common
 * football score?"), so every fact here is a real query result, not
 * written copy. Each fact's own query failing just means that one fact is
 * skipped (destructuring only `data`, not `error`, is deliberate here) --
 * a decorative feature degrading gracefully rather than blocking the page
 * shell is the right trade-off. */
export async function getLandingTrivia(): Promise<TriviaFact[]> {
  const facts: TriviaFact[] = [];

  const { data: scorelineRows } = await (supabase as any).rpc('get_most_common_scoreline', { p_league_id: PL_LEAGUE_ID });
  const topScoreline = (scorelineRows ?? [])[0];
  if (topScoreline) {
    facts.push({
      question: 'What\u2019s the most common Premier League scoreline?',
      answer: `${topScoreline.home_goals}\u2013${topScoreline.away_goals} \u2014 it\u2019s happened ${topScoreline.occurrences} times across every match in the archive.`,
    });
  }

  const { data: seasonRows } = await supabase
    .from('matches')
    .select('full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  if (seasonRows && seasonRows.length > 0) {
    const totalGoals = (seasonRows as any[]).reduce((sum, r) => sum + r.full_time_home_goals + r.full_time_away_goals, 0);
    const perGame = totalGoals / seasonRows.length;
    facts.push({
      question: 'How many goals a game is this Premier League season averaging?',
      answer: `${perGame.toFixed(2)} \u2014 ${totalGoals} goals across ${seasonRows.length} matches so far.`,
    });
  }

  const { data: highScoringRows } = await supabase
    .from('matches')
    .select('home_team:teams!matches_home_team_id_fkey(canonical_name), away_team:teams!matches_away_team_id_fkey(canonical_name), full_time_home_goals, full_time_away_goals')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID);
  if (highScoringRows && highScoringRows.length > 0) {
    const top = (highScoringRows as any[]).reduce((best, r) => {
      const total = r.full_time_home_goals + r.full_time_away_goals;
      return total > best.total ? { ...r, total } : best;
    }, { total: -1 } as any);
    if (top.total >= 0) {
      facts.push({
        question: 'What\u2019s been the highest-scoring match this season?',
        answer: `${top.home_team?.canonical_name ?? 'Unknown'} ${top.full_time_home_goals}\u2013${top.full_time_away_goals} ${top.away_team?.canonical_name ?? 'Unknown'} \u2014 ${top.total} goals.`,
      });
    }
  }

  try {
    const topPick = await getLandingTopFplPick();
    if (topPick) {
      facts.push({
        question: 'Who\u2019s projected for the most Fantasy points next gameweek?',
        answer: `${topPick.web_name} (${topPick.team_name}) \u2014 ${topPick.expected_fpl_points.toFixed(1)} projected points for Gameweek ${topPick.matchweek}.`,
      });
    }
  } catch {
    // Non-critical -- the other facts still stand on their own.
  }

  return facts;
}
