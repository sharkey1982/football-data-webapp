// ============================================================================
// src/lib/matchesApi.ts
//
// NOTE ON TEAM NAMES: selects here read `canonical_name:display_name` --
// PostgREST column aliasing, not a typo. teams.canonical_name is the
// DATA-SOURCE name used to match incoming football-data.co.uk rows
// ("Nott'm Forest", "Sheffield Weds"); teams.display_name is the public
// one ("Nottingham Forest"). The frontend's notion of "the team's name"
// has always meant the display one, so it's corrected at the query
// boundary rather than in ~50 call sites.
//
// Played matches, head-to-head, search, and the league table computed
// from them. Split out of api.ts; MatchWithNames lives here because this
// is where match rows are read, and other modules import it from here.
// ============================================================================

import { supabase } from './supabase';
import type { Match, PointDeduction } from '../types/database';

export type MatchWithNames = Match & {
  home_team_name: string;
  away_team_name: string;
  league_code: string;
  league_name: string;
  season_label: string;
  // Populated only by getRawMatches -- other callers (head-to-head, team
  // history) don't need the competition/country breakdown, just team
  // names, so it stays optional rather than adding two joins everywhere.
  competition_type?: string | null;
  country_name?: string | null;
};


// ----------------------------------------------------------------------------
// Matches
// ----------------------------------------------------------------------------

export async function getRecentMatches(limit = 20): Promise<MatchWithNames[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name:display_name),
      league:leagues(code, name),
      season:seasons(label)
    `
    )
    .order('match_date', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    league_code: row.league?.code ?? '',
    league_name: row.league?.name ?? '',
    season_label: row.season?.label ?? '',
  }));
}

export async function getMatchesForTeam(teamId: number, limit = 20) {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name:display_name),
      league:leagues(code, name),
      season:seasons(label)
    `
    )
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('match_date', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    league_code: row.league?.code ?? '',
    league_name: row.league?.name ?? '',
    season_label: row.season?.label ?? '',
  })) as MatchWithNames[];
}

/**
 * Looks up the exact result for one specific fixture -- league+season+home
 * +away, not just "these two teams' most recent meeting" (which is what
 * getHeadToHead returns and can be a different, more recent encounter in
 * another competition). Used to turn a fixture-list "Explore" link into an
 * actual result summary once that specific match has been played. Returns
 * null if it hasn't been played yet (or the pairing/season doesn't exist).
 */
export async function getMatchResult(
  leagueId: number,
  seasonId: number,
  homeTeamId: number,
  awayTeamId: number
): Promise<MatchWithNames | null> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name:display_name),
      league:leagues(code, name),
      season:seasons(label)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .eq('home_team_id', homeTeamId)
    .eq('away_team_id', awayTeamId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as any;
  return {
    ...row,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    league_code: row.league?.code ?? '',
    league_name: row.league?.name ?? '',
    season_label: row.season?.label ?? '',
  } as MatchWithNames;
}

export async function getHeadToHead(teamAId: number, teamBId: number, limit = 20) {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name:display_name),
      league:leagues(code, name),
      season:seasons(label)
    `
    )
    .or(
      `and(home_team_id.eq.${teamAId},away_team_id.eq.${teamBId}),and(home_team_id.eq.${teamBId},away_team_id.eq.${teamAId})`
    )
    .order('match_date', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    league_code: row.league?.code ?? '',
    league_name: row.league?.name ?? '',
    season_label: row.season?.label ?? '',
  })) as MatchWithNames[];
}

export async function searchMatches(params: {
  homeQuery?: string;
  awayQuery?: string;
  leagueId?: number;
  seasonId?: number;
  limit?: number;
}) {
  let query = supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name:display_name),
      league:leagues(code, name),
      season:seasons(label)
    `
    )
    .order('match_date', { ascending: false })
    .limit(params.limit ?? 50);

  if (params.leagueId) query = query.eq('league_id', params.leagueId);
  if (params.seasonId) query = query.eq('season_id', params.seasonId);

  const { data, error } = await query;
  if (error) throw error;

  let results = (data ?? []).map((row: any) => ({
    ...row,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    league_code: row.league?.code ?? '',
    league_name: row.league?.name ?? '',
    season_label: row.season?.label ?? '',
  })) as MatchWithNames[];

  // Client-side filter by team name substring -- the joined name isn't
  // filterable directly via PostgREST's nested-select syntax, and result
  // sets here are small enough (capped by `limit`) that this is fine.
  if (params.homeQuery) {
    const q = params.homeQuery.toLowerCase();
    results = results.filter((m) => m.home_team_name.toLowerCase().includes(q));
  }
  if (params.awayQuery) {
    const q = params.awayQuery.toLowerCase();
    results = results.filter((m) => m.away_team_name.toLowerCase().includes(q));
  }

  return results;
}

// ----------------------------------------------------------------------------
// League table -- computed client-side from `matches` (every played game
// for a league+season, regardless of how far the season has progressed),
// plus any manual point adjustments from `point_deductions`.
// ----------------------------------------------------------------------------

export type LeagueTableRow = {
  team_id: number;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  pointsBeforeAdjustment: number;
  pointsAdjustment: number;
  points: number;
  deductions: PointDeduction[];
};

/** Manual point adjustments (deductions or corrections) for a league+season. */
export async function getPointDeductions(leagueId: number, seasonId: number): Promise<PointDeduction[]> {
  const { data, error } = await supabase
    .from('point_deductions')
    .select('*')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Builds a standard league table (P/W/D/L/GF/GA/GD/Pts) from every match
 * played so far in a league+season, with any point_deductions applied on
 * top. Works for a fully historic season (every match played), the
 * current in-progress season (whatever's been played so far), or an
 * empty one (returns []) -- there's no dependency on `fixtures` at all,
 * since a table only needs results, not the schedule.
 *
 * Sort order: points desc, goal difference desc, goals for desc, then
 * team name -- the standard tie-break set when head-to-head records
 * aren't being modelled separately.
 */
export async function getLeagueTable(leagueId: number, seasonId: number): Promise<LeagueTableRow[]> {
  const [{ data, error }, deductions] = await Promise.all([
    supabase
      .from('matches')
      .select(
        `
        home_team_id, away_team_id, full_time_home_goals, full_time_away_goals, full_time_result,
        home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
        away_team:teams!matches_away_team_id_fkey(canonical_name:display_name)
      `
      )
      .eq('league_id', leagueId)
      .eq('season_id', seasonId),
    getPointDeductions(leagueId, seasonId),
  ]);
  if (error) throw error;

  const deductionsByTeam = new Map<number, PointDeduction[]>();
  for (const d of deductions) {
    (deductionsByTeam.get(d.team_id) ?? deductionsByTeam.set(d.team_id, []).get(d.team_id)!).push(d);
  }

  type Accumulator = Omit<LeagueTableRow, 'goalDifference' | 'points' | 'pointsAdjustment' | 'deductions'>;
  const rows = new Map<number, Accumulator>();

  function rowFor(teamId: number, teamName: string): Accumulator {
    let row = rows.get(teamId);
    if (!row) {
      row = {
        team_id: teamId,
        team_name: teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        pointsBeforeAdjustment: 0,
      };
      rows.set(teamId, row);
    }
    return row;
  }

  for (const m of (data ?? []) as any[]) {
    const home = rowFor(m.home_team_id, m.home_team?.canonical_name ?? 'Unknown');
    const away = rowFor(m.away_team_id, m.away_team?.canonical_name ?? 'Unknown');

    home.played++;
    away.played++;
    home.goalsFor += m.full_time_home_goals;
    home.goalsAgainst += m.full_time_away_goals;
    away.goalsFor += m.full_time_away_goals;
    away.goalsAgainst += m.full_time_home_goals;

    if (m.full_time_result === 'D') {
      home.drawn++;
      away.drawn++;
      home.pointsBeforeAdjustment += 1;
      away.pointsBeforeAdjustment += 1;
    } else if (m.full_time_result === 'H') {
      home.won++;
      away.lost++;
      home.pointsBeforeAdjustment += 3;
    } else {
      away.won++;
      home.lost++;
      away.pointsBeforeAdjustment += 3;
    }
  }

  return [...rows.values()]
    .map((row) => {
      const teamDeductions = deductionsByTeam.get(row.team_id) ?? [];
      const pointsAdjustment = teamDeductions.reduce((sum, d) => sum + d.points, 0);
      return {
        ...row,
        goalDifference: row.goalsFor - row.goalsAgainst,
        pointsAdjustment,
        points: row.pointsBeforeAdjustment + pointsAdjustment,
        deductions: teamDeductions,
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team_name.localeCompare(b.team_name);
    });
}

