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
  /** Split-format leagues: 1 = championship group, 2+ = lower groups; null otherwise. */
  splitGroup: number | null;
  /** Points removed (negative) or carried over at the split, e.g. halving. 0 if none. */
  splitAdjustment: number;
  /** 'points', or 'points per game' for a season cut short. */
  rankedOn: string;
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
 * The league table for a league+season, read from the `league_standings`
 * view so every page shows the same, official ordering: point deductions,
 * the Football League's goals-scored tie-break before 1999/2000, seasons cut
 * short ranked on points per game, and split-format leagues (clubs locked
 * into their group after the split, points halved where the league does so,
 * European play-off ties left out). Works for the current season too
 * (results so far) and returns [] when nothing has been played.
 */
export async function getLeagueTable(leagueId: number, seasonId: number): Promise<LeagueTableRow[]> {
  const [{ data, error }, deductions] = await Promise.all([
    supabase
      .from('league_standings')
      .select('team_id, position, played, won, drawn, lost, goals_for, goals_against, points_won, deduction, split_adjustment, split_group, points, ranked_on')
      .eq('league_id', leagueId)
      .eq('season_id', seasonId)
      .order('position'),
    getPointDeductions(leagueId, seasonId),
  ]);
  if (error) throw error;
  const standings = (data ?? []) as {
    team_id: number; position: number; played: number; won: number; drawn: number; lost: number;
    goals_for: number; goals_against: number; points_won: number; deduction: number;
    split_adjustment: number | null; split_group: number | null; points: number; ranked_on: string;
  }[];
  if (standings.length === 0) return [];

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('team_id, display_name')
    .in('team_id', standings.map((r) => r.team_id));
  if (teamsError) throw teamsError;
  const names = new Map((teams ?? []).map((t: { team_id: number; display_name: string }) => [t.team_id, t.display_name]));

  return standings.map((r) => {
    const splitAdjustment = r.split_adjustment ?? 0;
    return {
      team_id: r.team_id,
      team_name: names.get(r.team_id) ?? 'Unknown',
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      goalsFor: r.goals_for,
      goalsAgainst: r.goals_against,
      goalDifference: r.goals_for - r.goals_against,
      pointsBeforeAdjustment: r.points_won + splitAdjustment,
      pointsAdjustment: r.deduction,
      points: r.points,
      deductions: deductions.filter((d) => d.team_id === r.team_id),
      splitGroup: r.split_group,
      splitAdjustment,
      rankedOn: r.ranked_on,
    };
  });
}


// ---- Points race: every club's points after each game ----------------------
export type RaceSeries = { id: number; name: string; values: number[] };

/**
 * Cumulative points after each club's 1st, 2nd, 3rd... game, in date order.
 * Frame k = every club after (k+1) games, or its latest total if it has
 * played fewer. A deduction applies from the club's first game on or after
 * its effective date (or at the end if undated/after the last game), so the
 * final frame equals the league table exactly.
 */
export function buildPointsRace(
  matches: { match_date: string; home_team_id: number; away_team_id: number; full_time_result: string; home_name: string; away_name: string }[],
  deductions: { team_id: number; points: number; effective_date: string | null }[]
): { frames: number; series: RaceSeries[] } {
  const games = new Map<number, { name: string; pts: { date: string; p: number }[] }>();
  const add = (id: number, name: string, date: string, p: number) => {
    if (!games.has(id)) games.set(id, { name, pts: [] });
    games.get(id)!.pts.push({ date, p });
  };
  for (const m of [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date))) {
    const r = m.full_time_result;
    add(m.home_team_id, m.home_name, m.match_date, r === 'H' ? 3 : r === 'D' ? 1 : 0);
    add(m.away_team_id, m.away_name, m.match_date, r === 'A' ? 3 : r === 'D' ? 1 : 0);
  }
  const frames = Math.max(0, ...[...games.values()].map((g) => g.pts.length));
  const series: RaceSeries[] = [];
  for (const [id, g] of games) {
    const cum: number[] = [];
    let total = 0;
    g.pts.forEach((x, k) => { total += x.p; cum[k] = total; });
    for (const d of deductions.filter((x) => x.team_id === id)) {
      let from = d.effective_date ? g.pts.findIndex((x) => x.date >= d.effective_date!) : -1;
      if (from < 0) from = g.pts.length - 1; // undated, or after the last game: at the end
      // Stored as a signed adjustment (a deduction is negative); added exactly as the table adds it.
      for (let k = from; k < cum.length; k++) cum[k] += d.points;
    }
    const values = Array.from({ length: frames }, (_, k) => cum[Math.min(k, cum.length - 1)] ?? 0);
    series.push({ id, name: g.name, values });
  }
  return { frames, series };
}

export async function getPointsRace(leagueId: number, seasonId: number): Promise<{ frames: number; series: RaceSeries[] }> {
  const [{ data, error }, deductions] = await Promise.all([
    supabase
      .from('matches')
      .select('match_date, home_team_id, away_team_id, full_time_result, home_team:teams!matches_home_team_id_fkey(canonical_name:display_name), away_team:teams!matches_away_team_id_fkey(canonical_name:display_name)')
      .eq('league_id', leagueId)
      .eq('season_id', seasonId),
    getPointDeductions(leagueId, seasonId),
  ]);
  if (error) throw error;
  const rows = (data ?? []).map((m) => ({
    match_date: String(m.match_date),
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    full_time_result: String(m.full_time_result),
    home_name: (m.home_team as { canonical_name?: string } | null)?.canonical_name ?? 'Unknown',
    away_name: (m.away_team as { canonical_name?: string } | null)?.canonical_name ?? 'Unknown',
  }));
  return buildPointsRace(rows, deductions.map((d) => ({ team_id: d.team_id, points: d.points, effective_date: (d as { effective_date?: string | null }).effective_date ?? null })));
}
