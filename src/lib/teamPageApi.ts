// ============================================================================
// src/lib/teamPageApi.ts
//
// Data for the canonical public team page (/football/teams/:slug).
//
// Distinct from TeamExplorer, which is an interactive browse-and-compare
// tool driven by client-side selection. This is one team, at a stable
// address, showing what the site actually knows about them: their
// model rating, recent results, and what's predicted next.
//
// Ratings come from the league's current ACCEPTED fit, including any
// manual override -- the same effective numbers the Team Strength page
// shows, so a team's rating can't read differently depending which page
// you're on.
// ============================================================================

import { supabase } from './supabase';

export type TeamPageProfile = {
  team_id: number;
  slug: string;
  display_name: string;
  league_name: string | null;
  league_id: number | null;
  /** Expected goals for/against a neutral opponent, derived from the
   * model's log-scale ratings. Null when the team has no rating in the
   * current accepted fit. */
  goals_for_per_game: number | null;
  goals_against_per_game: number | null;
  is_estimated: boolean;
  fitted_at: string | null;
};

export type TeamPageMatch = {
  slug: string | null;
  kickoff_date: string;
  opponent_name: string;
  is_home: boolean;
  status: string;
  goals_for: number | null;
  goals_against: number | null;
  predicted_goals_for: number | null;
  predicted_goals_against: number | null;
};

export async function getTeamPageBySlug(slug: string): Promise<TeamPageProfile | null> {
  const { data: team, error } = await supabase
    .from('teams')
    .select('team_id, slug, display_name')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!team) return null;

  // Which division the team currently plays in -- taken from their most
  // recent fixture rather than stored on the team, because teams get
  // promoted and relegated.
  const { data: recent } = await supabase
    .from('fixtures')
    .select('league_id, leagues(name)')
    .or(`home_team_id.eq.${team.team_id},away_team_id.eq.${team.team_id}`)
    .order('kickoff_date', { ascending: false })
    .limit(1);
  const leagueId = recent?.[0]?.league_id ?? null;
  const leagueName = recent?.[0]?.leagues?.name ?? null;

  let goalsFor: number | null = null;
  let goalsAgainst: number | null = null;
  let isEstimated = false;
  let fittedAt: string | null = null;

  if (leagueId != null) {
    // status = 'accepted' only -- a fit can converge and still be
    // statistically pathological, so this mirrors getLatestFitRun()
    // rather than taking the newest row.
    const { data: fit } = await supabase
      .from('model_fit_runs')
      .select('fit_run_id, fitted_at')
      .eq('league_id', leagueId)
      .eq('status', 'accepted')
      .order('fitted_at', { ascending: false })
      .limit(1);
    const fitRunId = fit?.[0]?.fit_run_id ?? null;
    fittedAt = fit?.[0]?.fitted_at ?? null;

    if (fitRunId != null) {
      const { data: rating } = await supabase
        .from('team_ratings')
        .select('attack_strength, defence_strength, is_estimated')
        .eq('fit_run_id', fitRunId)
        .eq('team_id', team.team_id)
        .maybeSingle();
      const { data: override } = await supabase
        .from('team_strength_manual_override')
        .select('attack_adjustment, defence_adjustment')
        .eq('team_id', team.team_id)
        .maybeSingle();

      if (rating) {
        const atk = Number(rating.attack_strength) + Number(override?.attack_adjustment ?? 0);
        const def = Number(rating.defence_strength) + Number(override?.defence_adjustment ?? 0);
        goalsFor = Math.exp(atk);
        goalsAgainst = Math.exp(-def);
        isEstimated = rating.is_estimated === true;
      }
    }
  }

  return {
    team_id: team.team_id,
    slug: team.slug,
    display_name: team.display_name,
    league_name: leagueName,
    league_id: leagueId,
    goals_for_per_game: goalsFor,
    goals_against_per_game: goalsAgainst,
    is_estimated: isEstimated,
    fitted_at: fittedAt,
  };
}

/** Recent results and upcoming fixtures in one ordered list, newest
 * results last so the page reads chronologically through "what happened"
 * into "what's next". */
export async function getTeamPageMatches(teamId: number, leagueId: number | null): Promise<TeamPageMatch[]> {
  if (leagueId == null) return [];
  const { data, error } = await supabase
    .from('fixtures')
    .select(
      // Single string LITERAL: supabase-js parses .select() at the type
      // level, and concatenation collapses every embedded column to
      // GenericStringError.
      'slug, kickoff_date, status, home_team_id, away_team_id, predicted_home_goals, predicted_away_goals, home_team:teams!fixtures_home_team_id_fkey(display_name), away_team:teams!fixtures_away_team_id_fkey(display_name)'
    )
    .eq('league_id', leagueId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('kickoff_date', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []);
  if (rows.length === 0) return [];

  const { data: results } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, match_date, full_time_home_goals, full_time_away_goals')
    .eq('league_id', leagueId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
  const resultByKey = new Map<string, any>(
    (results ?? []).map((m) => [`${m.home_team_id}|${m.away_team_id}|${m.match_date}`, m])
  );

  return rows.map((f) => {
    const isHome = f.home_team_id === teamId;
    const res = resultByKey.get(`${f.home_team_id}|${f.away_team_id}|${f.kickoff_date}`);
    return {
      slug: f.slug ?? null,
      kickoff_date: f.kickoff_date,
      opponent_name: (isHome ? f.away_team?.display_name : f.home_team?.display_name) ?? 'Unknown',
      is_home: isHome,
      status: f.status,
      goals_for: res ? (isHome ? res.full_time_home_goals : res.full_time_away_goals) : null,
      goals_against: res ? (isHome ? res.full_time_away_goals : res.full_time_home_goals) : null,
      predicted_goals_for:
        f.predicted_home_goals == null ? null : Number(isHome ? f.predicted_home_goals : f.predicted_away_goals),
      predicted_goals_against:
        f.predicted_home_goals == null ? null : Number(isHome ? f.predicted_away_goals : f.predicted_home_goals),
    };
  });
}
