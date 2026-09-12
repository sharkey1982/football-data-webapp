// ============================================================================
// src/lib/api.ts
//
// Data-access layer. Every Supabase query the pages need lives here, so
// pages stay focused on rendering and this file stays the single place to
// look when a query needs changing.
// ============================================================================

import { supabase } from './supabase';
import type { Match, MatchResult, ModelFitRun, PointDeduction, RawMatchFile, SourceMatchRow } from '../types/database';
import { calculateDixonColes } from './dixonColes';

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
// Reference data
// ----------------------------------------------------------------------------

export async function getLeagues() {
  const { data, error } = await supabase
    .from('leagues')
    .select('league_id, code, name, tier, country_id, competition_type, scope')
    .order('code', { ascending: true });
  if (error) throw error;
  return data;
}

/** Countries a league/team can belong to -- powers the Country filter. */
export async function getCountries() {
  const { data, error } = await supabase
    .from('countries')
    .select('country_id, name, code')
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getSeasons() {
  const { data, error } = await supabase
    .from('seasons')
    .select('season_id, label, start_year, end_year')
    .order('start_year', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Team picker used by the Fixtures page's "By Team" search. Narrowing is
 * layered: if a division + season are both given, the result is scoped to
 * teams that actually appear in that division's fixtures that season (the
 * most accurate scope, and the only one that works for cups); otherwise a
 * country alone narrows by the team's home country; with neither, it's
 * every team, filtered by the search text.
 */
export async function getTeams(
  searchQuery?: string,
  options?: { countryId?: number | null; leagueId?: number | null; seasonId?: number | null }
) {
  if (options?.leagueId && options?.seasonId) {
    const teams = await getTeamsInLeagueFixtures(options.leagueId, options.seasonId);
    const q = searchQuery?.trim().toLowerCase();
    return q ? teams.filter((t) => t.canonical_name.toLowerCase().includes(q)) : teams;
  }

  let query = supabase.from('teams').select('team_id, canonical_name, country_id');
  if (options?.countryId) query = query.eq('country_id', options.countryId);
  if (searchQuery && searchQuery.trim() !== '') {
    query = query.ilike('canonical_name', `%${searchQuery.trim()}%`);
  }
  const { data, error } = await query.order('canonical_name', { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Finds the most recent season that has fixture data for a league --
 * used to determine "the current season" for team-picker purposes without
 * hardcoding a season label.
 */
export async function getMostRecentFixtureSeason(leagueId: number) {
  const { data, error } = await supabase
    .from('fixtures')
    .select('season_id, season:seasons(label, start_year)')
    .eq('league_id', leagueId)
    .order('season_id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as any;
  return { season_id: row.season_id as number, label: row.season?.label as string };
}

/**
 * Returns every team appearing in a league's fixture list for a season --
 * this is the definitive "who actually plays in this division this season"
 * list, which is NOT the same as "who has a Dixon-Coles rating in this
 * league" (a newly promoted team appears here with zero rating history).
 * Used by team pickers that need to offer every real team, including ones
 * the model can't yet rate.
 */
export async function getTeamsInLeagueFixtures(leagueId: number, seasonId: number) {
  const { data, error } = await supabase
    .from('fixtures')
    .select('home_team_id, away_team_id, home_team:teams!fixtures_home_team_id_fkey(canonical_name), away_team:teams!fixtures_away_team_id_fkey(canonical_name)')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId);
  if (error) throw error;

  const teamsById = new Map<number, string>();
  for (const row of (data ?? []) as any[]) {
    teamsById.set(row.home_team_id, row.home_team?.canonical_name ?? 'Unknown');
    teamsById.set(row.away_team_id, row.away_team?.canonical_name ?? 'Unknown');
  }

  return [...teamsById.entries()]
    .map(([team_id, canonical_name]) => ({ team_id, canonical_name }))
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
}

export async function getTeamById(teamId: number) {
  const { data, error } = await supabase
    .from('teams')
    .select('team_id, canonical_name, country_id')
    .eq('team_id', teamId)
    .single();
  if (error) throw error;
  return data;
}

// ----------------------------------------------------------------------------
// Team categories ("Big Six", "Newly Promoted", etc.)
// ----------------------------------------------------------------------------

export async function getTeamCategories() {
  const { data, error } = await supabase.from('team_categories').select('*').order('name');
  if (error) throw error;
  return data;
}

/** Teams belonging to a category for a given season. */
export async function getTeamsInCategory(categoryId: number, seasonId: number) {
  const { data, error } = await supabase
    .from('team_category_memberships')
    .select('team_id, team:teams(canonical_name)')
    .eq('category_id', categoryId)
    .eq('season_id', seasonId);
  if (error) throw error;

  return (data ?? [])
    .map((row: any) => ({ team_id: row.team_id, canonical_name: row.team?.canonical_name ?? 'Unknown' }))
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
}

/**
 * Aggregates a team's head-to-head record against EVERY team in a category
 * (e.g. "Arsenal vs the Big Six" = Arsenal's combined record against
 * Chelsea, Liverpool, Man City, Man United, and Tottenham, all pooled
 * together). Returns the pooled match list (for the existing
 * HeadToHeadSummary component) plus a per-opponent breakdown.
 */
export async function getHeadToHeadVsCategory(
  teamId: number,
  categoryId: number,
  seasonId: number,
  limitPerOpponent = 10
) {
  const opponents = await getTeamsInCategory(categoryId, seasonId);
  const relevantOpponents = opponents.filter((o) => o.team_id !== teamId);

  const perOpponent = await Promise.all(
    relevantOpponents.map(async (opp) => ({
      opponent: opp,
      matches: await getHeadToHead(teamId, opp.team_id, limitPerOpponent),
    }))
  );

  const pooled = perOpponent
    .flatMap((p) => p.matches)
    .sort((a, b) => (a.match_date < b.match_date ? 1 : -1)); // newest first, matching getHeadToHead's own order

  return { perOpponent, pooled, opponents: relevantOpponents };
}

// ----------------------------------------------------------------------------
// Matches
// ----------------------------------------------------------------------------

export async function getRecentMatches(limit = 20): Promise<MatchWithNames[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name),
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
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name),
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
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name),
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
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name),
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
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name),
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
        home_team:teams!matches_home_team_id_fkey(canonical_name),
        away_team:teams!matches_away_team_id_fkey(canonical_name)
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

// ----------------------------------------------------------------------------
// Form / stats helpers (computed client-side from raw match rows -- no
// stored aggregate tables yet; revisit if this gets slow at full data volume)
// ----------------------------------------------------------------------------

export type FormResult = 'W' | 'D' | 'L';

export function resultForTeam(match: Match, teamId: number): FormResult {
  const isHome = match.home_team_id === teamId;
  const result: MatchResult = match.full_time_result;
  if (result === 'D') return 'D';
  if ((result === 'H' && isHome) || (result === 'A' && !isHome)) return 'W';
  return 'L';
}

export interface FormEntry {
  result: FormResult;
  detail: string;
}

/**
 * Builds the result + a human-readable detail string ("vs Tottenham, 2-1 (H)")
 * for each match in a list, most-recent-first as given -- used to give
 * FormBadge tooltips real context instead of just a bare Win/Draw/Loss label.
 */
export function buildFormEntries(matches: MatchWithNames[], teamId: number): FormEntry[] {
  return matches.map((m) => {
    const isHome = m.home_team_id === teamId;
    const opponent = isHome ? m.away_team_name : m.home_team_name;
    const ownGoals = isHome ? m.full_time_home_goals : m.full_time_away_goals;
    const oppGoals = isHome ? m.full_time_away_goals : m.full_time_home_goals;
    return {
      result: resultForTeam(m, teamId),
      detail: `vs ${opponent}, ${ownGoals}-${oppGoals} (${isHome ? 'H' : 'A'})`,
    };
  });
}

export function summarizeForm(matches: Match[], teamId: number) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const m of matches) {
    const isHome = m.home_team_id === teamId;
    const gf = isHome ? m.full_time_home_goals : m.full_time_away_goals;
    const ga = isHome ? m.full_time_away_goals : m.full_time_home_goals;
    goalsFor += gf;
    goalsAgainst += ga;

    const result = resultForTeam(m, teamId);
    if (result === 'W') wins++;
    else if (result === 'D') draws++;
    else losses++;
  }

  return {
    played: matches.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    form: matches.map((m) => resultForTeam(m, teamId)),
  };
}

export function splitHomeAway(matches: MatchWithNames[], teamId: number) {
  const home = matches.filter((m) => m.home_team_id === teamId);
  const away = matches.filter((m) => m.away_team_id === teamId);
  return { home, away };
}

export interface GoalsDistributionStats {
  /** Count of matches falling into each goals-scored bucket: 0, 1, 2, 3+. */
  bucketCounts: { '0': number; '1': number; '2': number; '3+': number };
  median: number;
  mode: number;
  mean: number;
}

function distributionStats(values: number[]): GoalsDistributionStats {
  const bucketCounts = { '0': 0, '1': 0, '2': 0, '3+': 0 };
  for (const v of values) {
    if (v === 0) bucketCounts['0']++;
    else if (v === 1) bucketCounts['1']++;
    else if (v === 2) bucketCounts['2']++;
    else bucketCounts['3+']++;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n === 0 ? 0 : n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let mode = 0;
  let modeCount = -1;
  for (const [v, count] of freq) {
    if (count > modeCount) {
      mode = v;
      modeCount = count;
    }
  }

  const mean = n === 0 ? 0 : values.reduce((a, b) => a + b, 0) / n;

  return { bucketCounts, median, mode, mean };
}

/**
 * Computes the goals-for / goals-against / net-goals distribution stats
 * (matching the spreadsheet layout: bucketed counts, median, mode, mean)
 * for a rolling window of a team's matches. Pass an already-sliced/filtered
 * match list (e.g. last 10, or home-only) -- this function doesn't do any
 * windowing itself, just the statistics.
 */
export function calculateGoalsDistribution(
  matches: MatchWithNames[],
  teamId: number
): { goalsFor: GoalsDistributionStats; goalsAgainst: GoalsDistributionStats; net: GoalsDistributionStats } {
  const gfValues: number[] = [];
  const gaValues: number[] = [];
  const netValues: number[] = [];

  for (const m of matches) {
    const isHome = m.home_team_id === teamId;
    const gf = isHome ? m.full_time_home_goals : m.full_time_away_goals;
    const ga = isHome ? m.full_time_away_goals : m.full_time_home_goals;
    gfValues.push(gf);
    gaValues.push(ga);
    netValues.push(gf - ga);
  }

  return {
    goalsFor: distributionStats(gfValues),
    goalsAgainst: distributionStats(gaValues),
    net: distributionStats(netValues),
  };
}

export interface TeamStreaks {
  unbeaten: number;
  winning: number;
  cleanSheets: number;
  scoringIn: number; // consecutive matches with at least one goal scored
}

/**
 * Computes "current streak" callouts from a list of matches, MOST RECENT
 * FIRST (as returned by getMatchesForTeam/getHeadToHead). A streak is the
 * count of consecutive matches from the most recent one backwards that
 * satisfy the condition -- it stops at the first match that breaks it,
 * exactly matching how "unbeaten in 6" is meant on a results page.
 */
export function computeStreaks(matches: MatchWithNames[], teamId: number): TeamStreaks {
  let unbeaten = 0;
  let winning = 0;
  let cleanSheets = 0;
  let scoringIn = 0;

  let unbeatenBroken = false;
  let winningBroken = false;
  let cleanSheetBroken = false;
  let scoringBroken = false;

  for (const m of matches) {
    const isHome = m.home_team_id === teamId;
    const goalsFor = isHome ? m.full_time_home_goals : m.full_time_away_goals;
    const goalsAgainst = isHome ? m.full_time_away_goals : m.full_time_home_goals;
    const result = resultForTeam(m, teamId);

    if (!unbeatenBroken) {
      if (result !== 'L') unbeaten++;
      else unbeatenBroken = true;
    }
    if (!winningBroken) {
      if (result === 'W') winning++;
      else winningBroken = true;
    }
    if (!cleanSheetBroken) {
      if (goalsAgainst === 0) cleanSheets++;
      else cleanSheetBroken = true;
    }
    if (!scoringBroken) {
      if (goalsFor > 0) scoringIn++;
      else scoringBroken = true;
    }

    if (unbeatenBroken && winningBroken && cleanSheetBroken && scoringBroken) break;
  }

  return { unbeaten, winning, cleanSheets, scoringIn };
}

export interface MatchTrendPoint {
  matchDate: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: FormResult;
  isHome: boolean;
}

/**
 * Converts a list of matches (most-recent-first, as returned by
 * getMatchesForTeam) into a chronological per-match series suitable for
 * charting -- goals for/against and result, oldest to newest, so trend
 * lines read left-to-right in the natural reading direction.
 */
export function buildMatchTrend(matches: MatchWithNames[], teamId: number): MatchTrendPoint[] {
  const chronological = [...matches].reverse(); // input is newest-first
  return chronological.map((m) => {
    const isHome = m.home_team_id === teamId;
    return {
      matchDate: m.match_date,
      opponent: isHome ? m.away_team_name : m.home_team_name,
      goalsFor: isHome ? m.full_time_home_goals : m.full_time_away_goals,
      goalsAgainst: isHome ? m.full_time_away_goals : m.full_time_home_goals,
      result: resultForTeam(m, teamId),
      isHome,
    };
  });
}

// ----------------------------------------------------------------------------
// Dixon-Coles model data
//
// IMPORTANT: ratings are only meaningful relative to other teams in the SAME
// fit run -- a team's Championship attack rating and its Premier League
// attack rating are on different scales (different leagues score goals at
// different rates) even though they're stored in the same table. Every
// function here takes or returns a fit_run_id explicitly, and team lists are
// always scoped to one league's latest fit, so it's structurally impossible
// to accidentally mix ratings from two different leagues into one prediction.
// ----------------------------------------------------------------------------

export type TeamWithRating = {
  team_id: number;
  canonical_name: string;
  attack_strength: number;
  defence_strength: number;
  is_estimated: boolean;
  estimation_note: string | null;
};

/** Fetches every available fit run for a league, most recent first. */
export async function getFitRunsForLeague(leagueId: number) {
  const { data, error } = await supabase
    .from('model_fit_runs')
    .select('*')
    .eq('league_id', leagueId)
    .eq('converged', true)
    .order('fitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Fetches the single most recent fit run for a league, or null if none exists yet. */
export async function getLatestFitRun(leagueId: number) {
  const { data, error } = await supabase
    .from('model_fit_runs')
    .select('*')
    .eq('league_id', leagueId)
    .eq('converged', true)
    .order('fitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Fetches every team rated in a given fit run, joined with team names.
 * This is the ONLY supported way to get "the list of teams for this
 * league's predictions" -- it's impossible to get a team here that isn't
 * actually rated in this specific fit, which is what prevents the
 * cross-league rating mixup (e.g. a team's Championship rating leaking
 * into a Premier League prediction).
 */
export async function getTeamRatingsForFitRun(fitRunId: number): Promise<TeamWithRating[]> {
  const { data, error } = await supabase
    .from('team_ratings')
    .select('team_id, attack_strength, defence_strength, is_estimated, estimation_note, team:teams!team_ratings_team_id_fkey(canonical_name)')
    .eq('fit_run_id', fitRunId);
  if (error) throw error;

  return (data ?? [])
    .map((row: any) => ({
      team_id: row.team_id,
      canonical_name: row.team?.canonical_name ?? 'Unknown',
      attack_strength: row.attack_strength,
      defence_strength: row.defence_strength,
      is_estimated: row.is_estimated ?? false,
      estimation_note: row.estimation_note ?? null,
    }))
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
}

// ----------------------------------------------------------------------------
// Fantasy fixture difficulty -- Dixon-Coles expected goals for every
// upcoming fixture, per team, for the Fantasy heat map.
// ----------------------------------------------------------------------------

export interface FantasyFixtureCell {
  fixture_id: number;
  kickoff_date: string;
  matchweek: number | null;
  opponent_team_id: number;
  opponent_name: string;
  is_home: boolean;
  expected_goals_for: number;
  expected_goals_against: number;
  opponent_attack_strength: number;
  opponent_defence_strength: number;
}

export interface FantasyTeamFixtures {
  team_id: number;
  team_name: string;
  /** Chronological (matchweek, then kickoff_date) order -- earliest fixture first. */
  fixtures: FantasyFixtureCell[];
}

export interface FantasyFixtureData {
  fitRun: ModelFitRun | null;
  ratings: TeamWithRating[];
  teams: FantasyTeamFixtures[];
}

/**
 * Builds the per-team list of upcoming fixtures with Dixon-Coles expected
 * goals for/against, for the Fantasy fixture-difficulty heat map. "Upcoming"
 * means any fixture not yet played (scheduled or postponed) -- postponed
 * fixtures are kept even without a firm date since they'll still count
 * against a team's near-term run once rescheduled.
 *
 * A fixture where either side has no rating in the latest fit run (freshly
 * promoted, not enough matches yet) is skipped entirely rather than shown
 * with a fabricated number -- there's no real attack/defence strength to
 * base an expected-goals figure on.
 */
export async function getFantasyFixtureDifficulty(
  leagueId: number,
  seasonId: number
): Promise<FantasyFixtureData> {
  const fitRun = await getLatestFitRun(leagueId);
  if (!fitRun) return { fitRun: null, ratings: [], teams: [] };

  const ratings = await getTeamRatingsForFitRun(fitRun.fit_run_id);
  const ratingByTeam = new Map(ratings.map((r) => [r.team_id, r]));

  const { data, error } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, kickoff_date, matchweek, status,
      home_team_id, away_team_id,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .neq('status', 'played')
    .order('matchweek', { ascending: true, nullsFirst: false })
    .order('kickoff_date', { ascending: true });
  if (error) throw error;

  const byTeam = new Map<number, FantasyTeamFixtures>();
  const ensureTeam = (teamId: number, name: string) => {
    let entry = byTeam.get(teamId);
    if (!entry) {
      entry = { team_id: teamId, team_name: name, fixtures: [] };
      byTeam.set(teamId, entry);
    }
    return entry;
  };

  for (const row of (data ?? []) as any[]) {
    const homeRating = ratingByTeam.get(row.home_team_id);
    const awayRating = ratingByTeam.get(row.away_team_id);
    if (!homeRating || !awayRating) continue;

    const dc = calculateDixonColes({
      homeAttack: homeRating.attack_strength,
      homeDefence: homeRating.defence_strength,
      awayAttack: awayRating.attack_strength,
      awayDefence: awayRating.defence_strength,
      rho: fitRun.rho,
      homeAdvantage: fitRun.home_advantage,
    });

    const homeName = row.home_team?.canonical_name ?? 'Unknown';
    const awayName = row.away_team?.canonical_name ?? 'Unknown';

    ensureTeam(row.home_team_id, homeName).fixtures.push({
      fixture_id: row.fixture_id,
      kickoff_date: row.kickoff_date,
      matchweek: row.matchweek,
      opponent_team_id: row.away_team_id,
      opponent_name: awayName,
      is_home: true,
      expected_goals_for: dc.expectedHomeGoals,
      expected_goals_against: dc.expectedAwayGoals,
      opponent_attack_strength: awayRating.attack_strength,
      opponent_defence_strength: awayRating.defence_strength,
    });

    ensureTeam(row.away_team_id, awayName).fixtures.push({
      fixture_id: row.fixture_id,
      kickoff_date: row.kickoff_date,
      matchweek: row.matchweek,
      opponent_team_id: row.home_team_id,
      opponent_name: homeName,
      is_home: false,
      expected_goals_for: dc.expectedAwayGoals,
      expected_goals_against: dc.expectedHomeGoals,
      opponent_attack_strength: homeRating.attack_strength,
      opponent_defence_strength: homeRating.defence_strength,
    });
  }

  const teams = [...byTeam.values()].sort((a, b) => a.team_name.localeCompare(b.team_name));
  return { fitRun, ratings, teams };
}

/**
 * Buckets every rated team's attack/defence strength into FDR-style
 * quintiles (1 = weakest, 5 = strongest), for the "simple rating" colour
 * toggle -- an alternative to the raw Dixon-Coles expected-goals scale that
 * mirrors the familiar 1-5 fixture-difficulty convention fantasy players
 * already know, independent of the model's actual goal-scale numbers.
 */
export function computeFdrQuintiles(
  ratings: TeamWithRating[]
): Map<number, { attack_fdr: number; defence_fdr: number }> {
  function quintileRanks(values: { team_id: number; value: number }[]): Map<number, number> {
    const sorted = [...values].sort((a, b) => a.value - b.value);
    const n = sorted.length;
    const ranks = new Map<number, number>();
    sorted.forEach((v, i) => {
      const bucket = Math.min(5, Math.floor((i / n) * 5) + 1);
      ranks.set(v.team_id, bucket);
    });
    return ranks;
  }

  const attackRanks = quintileRanks(ratings.map((r) => ({ team_id: r.team_id, value: r.attack_strength })));
  const defenceRanks = quintileRanks(ratings.map((r) => ({ team_id: r.team_id, value: r.defence_strength })));

  const result = new Map<number, { attack_fdr: number; defence_fdr: number }>();
  for (const r of ratings) {
    result.set(r.team_id, {
      attack_fdr: attackRanks.get(r.team_id) ?? 3,
      defence_fdr: defenceRanks.get(r.team_id) ?? 3,
    });
  }
  return result;
}

// ----------------------------------------------------------------------------
// Raw data browser -- generic, filterable view over the matches table
// ----------------------------------------------------------------------------

export type MatchVenueFilter = 'home' | 'away' | 'either';

export interface RawMatchesFilters {
  leagueId?: number;
  seasonId?: number;
  teamId?: number;
  venue?: MatchVenueFilter; // only meaningful when teamId is set; defaults to 'either'
  competitionType?: string; // filters directly, independent of leagueId -- e.g. "all cups" with no single division picked
  countryId?: number;
}

// PostgREST's own hard cap is 1000 rows per request regardless of what we
// ask for, so this is a UI-level cap one below that -- if we ever hit it,
// we want to know it was OUR limit (and tell the person to narrow further),
// not silently get the same number back from a server-side cutoff and not
// realise results are incomplete.
const RAW_MATCHES_ROW_CAP = 1000;

/**
 * Generic filterable matches query for the Raw Data tab. Unlike
 * getMatchesForTeam/searchMatches (which are tuned for their specific
 * callers, with small limits and team-name-substring matching), this is
 * meant to return "give me everything matching these filters" -- exact
 * team_id matching, an explicit home/away/either venue constraint, and a
 * row count high enough to cover a full team-season (and most
 * league+season combinations) without truncation.
 *
 * Returns both the rows and whether the result was capped, so the UI can
 * tell the person to narrow their filters rather than silently showing a
 * partial table.
 */
export async function getRawMatches(
  filters: RawMatchesFilters
): Promise<{ matches: MatchWithNames[]; truncated: boolean }> {
  let query = supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name),
      league:leagues!inner(code, name, competition_type, country:countries(name)),
      season:seasons(label)
    `
    )
    .order('match_date', { ascending: false })
    .limit(RAW_MATCHES_ROW_CAP + 1); // +1 so we can detect truncation, not just hit the cap blind

  if (filters.leagueId) query = query.eq('league_id', filters.leagueId);
  if (filters.seasonId) query = query.eq('season_id', filters.seasonId);
  // Filtered via the embedded `league` resource -- !inner above is required
  // for a PostgREST embedded-column filter to actually constrain rows
  // rather than just shaping the select.
  if (filters.competitionType) query = query.eq('league.competition_type', filters.competitionType);
  if (filters.countryId) query = query.eq('league.country_id', filters.countryId);

  if (filters.teamId) {
    const venue = filters.venue ?? 'either';
    if (venue === 'home') {
      query = query.eq('home_team_id', filters.teamId);
    } else if (venue === 'away') {
      query = query.eq('away_team_id', filters.teamId);
    } else {
      query = query.or(`home_team_id.eq.${filters.teamId},away_team_id.eq.${filters.teamId}`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const truncated = rows.length > RAW_MATCHES_ROW_CAP;
  const matches = (truncated ? rows.slice(0, RAW_MATCHES_ROW_CAP) : rows).map((row: any) => ({
    ...row,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    league_code: row.league?.code ?? '',
    league_name: row.league?.name ?? '',
    season_label: row.season?.label ?? '',
    competition_type: row.league?.competition_type ?? null,
    country_name: row.league?.country?.name ?? null,
  })) as MatchWithNames[];

  return { matches, truncated };
}

/** Converts raw match rows to a CSV string for the Raw Data tab's export. */
export function matchesToCsv(matches: MatchWithNames[]): string {
  const columns: { header: string; get: (m: MatchWithNames) => string | number }[] = [
    { header: 'Date', get: (m) => m.match_date },
    { header: 'League', get: (m) => m.league_code },
    { header: 'Competition Type', get: (m) => m.competition_type ?? '' },
    { header: 'Country', get: (m) => m.country_name ?? '' },
    { header: 'Season', get: (m) => m.season_label },
    { header: 'Home Team', get: (m) => m.home_team_name },
    { header: 'Away Team', get: (m) => m.away_team_name },
    { header: 'FT Home Goals', get: (m) => m.full_time_home_goals },
    { header: 'FT Away Goals', get: (m) => m.full_time_away_goals },
    { header: 'FT Result', get: (m) => m.full_time_result },
    { header: 'HT Home Goals', get: (m) => m.half_time_home_goals ?? '' },
    { header: 'HT Away Goals', get: (m) => m.half_time_away_goals ?? '' },
    { header: 'HT Result', get: (m) => m.half_time_result ?? '' },
    { header: 'Home Shots', get: (m) => m.home_shots ?? '' },
    { header: 'Away Shots', get: (m) => m.away_shots ?? '' },
    { header: 'Home Shots on Target', get: (m) => m.home_shots_on_target ?? '' },
    { header: 'Away Shots on Target', get: (m) => m.away_shots_on_target ?? '' },
    { header: 'Home Corners', get: (m) => m.home_corners ?? '' },
    { header: 'Away Corners', get: (m) => m.away_corners ?? '' },
    { header: 'Home Fouls', get: (m) => m.home_fouls ?? '' },
    { header: 'Away Fouls', get: (m) => m.away_fouls ?? '' },
    { header: 'Home Yellow Cards', get: (m) => m.home_yellow_cards },
    { header: 'Away Yellow Cards', get: (m) => m.away_yellow_cards },
    { header: 'Home Red Cards', get: (m) => m.home_red_cards },
    { header: 'Away Red Cards', get: (m) => m.away_red_cards },
    { header: 'Referee', get: (m) => m.referee ?? '' },
  ];

  // CSV-escape: wrap in quotes and double up any embedded quotes if the
  // value contains a comma, quote, or newline -- team names and referee
  // names are the only realistic source of commas (e.g. "Nott'm Forest"
  // has an apostrophe, not a comma, but better safe than a malformed file).
  function escapeCsvValue(value: string | number): string {
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const headerRow = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const dataRows = matches.map((m) => columns.map((c) => escapeCsvValue(c.get(m))).join(','));
  return [headerRow, ...dataRows].join('\n');
}

export type FixtureWithNames = {
  fixture_id: number;
  league_id: number;
  season_id: number;
  home_team_id: number;
  away_team_id: number;
  home_team_name: string;
  away_team_name: string;
  kickoff_date: string;
  kickoff_time: string | null;
  matchweek: number | null;
  status: string;
  // Populated only by getFixturesForTeam, since a team-scoped fixture list
  // spans multiple competitions (league + cups) and needs a badge to show
  // which one each row belongs to. Division-scoped queries omit these --
  // the page already knows which single league it's showing.
  league_code?: string;
  league_name?: string;
  competition_type?: string | null;
  // Populated from the `matches` table when a result exists for this
  // fixture (matched on league/season/teams/date -- fixtures and matches
  // aren't linked by a foreign key, so this is a manual join). Null/undefined
  // when the fixture hasn't been played yet.
  full_time_home_goals?: number | null;
  full_time_away_goals?: number | null;
  half_time_home_goals?: number | null;
  half_time_away_goals?: number | null;
  // Dixon-Coles expected goals, frozen pre-match -- see Fixture type and
  // backfill_fixture_predictions(). Only meaningful (and only ever
  // populated) while the fixture is still scheduled/postponed; a played
  // fixture's full_time_* goals take precedence in the UI.
  predicted_home_goals?: number | null;
  predicted_away_goals?: number | null;
};

/**
 * Looks up final (and half-time) scores for a set of fixtures from the
 * `matches` table and merges them in. There's no FK between fixtures and
 * matches, so the join is done here by (league, season, home team, away
 * team) -- NOT by date. `fixtures.kickoff_date` only holds the real
 * per-match date for matchweek 1; every later matchweek stores a single
 * placeholder "week commencing" date across all 10 fixtures, while
 * `matches.match_date` holds the real played date (which can differ by a
 * few days either side once TV scheduling/postponements are applied). A
 * home/away team pairing is unique within a league+season (single
 * round-robin, verified against both tables), so it's a safe join key.
 * Fixtures with no matching result (not yet played) are returned unchanged.
 */
async function attachResults(
  fixtures: FixtureWithNames[],
  leagueId: number,
  seasonId: number
): Promise<FixtureWithNames[]> {
  if (fixtures.length === 0) return fixtures;

  const { data, error } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, full_time_home_goals, full_time_away_goals, half_time_home_goals, half_time_away_goals')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId);
  if (error) throw error;

  const resultsByKey = new Map<string, (typeof data)[number]>();
  for (const row of data ?? []) {
    resultsByKey.set(`${row.home_team_id}-${row.away_team_id}`, row);
  }

  return fixtures.map((f) => {
    const result = resultsByKey.get(`${f.home_team_id}-${f.away_team_id}`);
    if (!result) return f;
    return {
      ...f,
      full_time_home_goals: result.full_time_home_goals,
      full_time_away_goals: result.full_time_away_goals,
      half_time_home_goals: result.half_time_home_goals,
      half_time_away_goals: result.half_time_away_goals,
    };
  });
}

/**
 * Same idea as `attachResults`, but for a team-scoped fixture list that can
 * span several competitions in the same season (league + cups). The join
 * key includes `league_id` because the same two teams could in principle
 * meet in more than one competition in a season, which a team+opponent-only
 * key would collide on.
 */
async function attachResultsForTeam(
  fixtures: FixtureWithNames[],
  seasonId: number,
  teamId: number
): Promise<FixtureWithNames[]> {
  if (fixtures.length === 0) return fixtures;

  const { data, error } = await supabase
    .from('matches')
    .select('league_id, home_team_id, away_team_id, full_time_home_goals, full_time_away_goals, half_time_home_goals, half_time_away_goals')
    .eq('season_id', seasonId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
  if (error) throw error;

  const resultsByKey = new Map<string, (typeof data)[number]>();
  for (const row of data ?? []) {
    resultsByKey.set(`${row.league_id}-${row.home_team_id}-${row.away_team_id}`, row);
  }

  return fixtures.map((f) => {
    const result = resultsByKey.get(`${f.league_id}-${f.home_team_id}-${f.away_team_id}`);
    if (!result) return f;
    return {
      ...f,
      full_time_home_goals: result.full_time_home_goals,
      full_time_away_goals: result.full_time_away_goals,
      half_time_home_goals: result.half_time_home_goals,
      half_time_away_goals: result.half_time_away_goals,
    };
  });
}

/**
 * Fetches every fixture for one team in a season, across ALL competitions
 * (league + any cups) rather than one division at a time -- this is what
 * powers the Fixtures page's "By Team" view, since a club's season isn't
 * scoped to a single league the way the calendar/matchweek view is. Each
 * row carries the league code/name so the UI can badge which competition
 * it belongs to.
 */
export async function getFixturesForTeam(
  teamId: number,
  seasonId: number
): Promise<FixtureWithNames[]> {
  const { data, error } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, league_id, season_id, home_team_id, away_team_id,
      kickoff_date, kickoff_time, matchweek, status,
      predicted_home_goals, predicted_away_goals,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name),
      league:leagues(code, name, competition_type)
    `
    )
    .eq('season_id', seasonId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('kickoff_date', { ascending: true })
    .order('kickoff_time', { ascending: true, nullsFirst: true });
  if (error) throw error;

  const fixtures = (data ?? []).map((row: any) => ({
    fixture_id: row.fixture_id,
    league_id: row.league_id,
    season_id: row.season_id,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    kickoff_date: row.kickoff_date,
    kickoff_time: row.kickoff_time,
    matchweek: row.matchweek,
    status: row.status,
    league_code: row.league?.code,
    league_name: row.league?.name,
    competition_type: row.league?.competition_type,
    predicted_home_goals: row.predicted_home_goals,
    predicted_away_goals: row.predicted_away_goals,
  }));
  return attachResultsForTeam(fixtures, seasonId, teamId);
}

/**
 * Matches-sourced counterpart to getFixturesForTeam, for a team+season
 * combination that has no rows in `fixtures` at all (a fully historic,
 * completed season -- see getMatchesForSeasonAsFixtures for why). Unlike
 * getFixturesForTeam, no separate results-attach step is needed: `matches`
 * rows already carry their own full-time/half-time scores directly.
 */
export async function getMatchesForTeamAsFixtures(
  teamId: number,
  seasonId: number
): Promise<FixtureWithNames[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      match_id, league_id, season_id, home_team_id, away_team_id,
      match_date, kickoff_time,
      full_time_home_goals, full_time_away_goals,
      half_time_home_goals, half_time_away_goals,
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name),
      league:leagues(code, name, competition_type)
    `
    )
    .eq('season_id', seasonId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('match_date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    fixture_id: row.match_id,
    league_id: row.league_id,
    season_id: row.season_id,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    kickoff_date: row.match_date,
    kickoff_time: row.kickoff_time,
    matchweek: null,
    status: 'played',
    league_code: row.league?.code,
    league_name: row.league?.name,
    competition_type: row.league?.competition_type,
    full_time_home_goals: row.full_time_home_goals,
    full_time_away_goals: row.full_time_away_goals,
    half_time_home_goals: row.half_time_home_goals,
    half_time_away_goals: row.half_time_away_goals,
  }));
}

/** Returns the distinct, ordered list of matchweek numbers available for a league+season. */
export async function getAvailableMatchweeks(leagueId: number, seasonId: number): Promise<number[]> {
  const { data, error } = await supabase
    .from('fixtures')
    .select('matchweek')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .not('matchweek', 'is', null)
    .order('matchweek', { ascending: true });
  if (error) throw error;

  const seen = new Set<number>();
  for (const row of data ?? []) {
    if (row.matchweek !== null) seen.add(row.matchweek);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Returns a map of ISO date ('YYYY-MM-DD') to fixture count for a
 * league+season -- powers the calendar heat-map on the Fixtures page.
 * Only fetches the date column (no team joins) since counts are all the
 * calendar needs.
 */
export async function getFixtureDateCounts(
  leagueId: number,
  seasonId: number
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('fixtures')
    .select('kickoff_date')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.kickoff_date] = (counts[row.kickoff_date] ?? 0) + 1;
  }
  return counts;
}

/**
 * Fetches kickoff date + matchweek for every fixture in a league/season in
 * a single lightweight query. Powers both the calendar heat-map (date ->
 * count) and the "which matchweeks fall in this calendar month" filtering
 * on the Fixtures page, computed client-side from the same rows so only
 * one round trip is needed.
 *
 * Caveat: `kickoff_date` is only ever a real per-match date for matchweek
 * 1 -- every later matchweek currently stores one placeholder "week
 * commencing" date across all its fixtures (see the note on
 * `attachResults`). That's still good enough to bucket a matchweek into
 * the right calendar month (gameweeks don't span a month boundary in
 * practice), just not precise enough for a real per-day breakdown once
 * TV scheduling/postponements spread a week's games across several days.
 */
/**
 * Returns the timestamp of the most recent successful daily fixture-import
 * run, or null if none has completed yet -- used to show "data last
 * refreshed" on the Fixtures page rather than trusting an arbitrary row's
 * created_at (fixtures are upserted, not appended, so a row's own timestamp
 * doesn't reliably reflect the last time the importer ran).
 */
export async function getLastFixtureRefresh(): Promise<string | null> {
  const { data, error } = await supabase
    .from('fixture_refresh_runs')
    .select('finished_at')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.finished_at ?? null;
}

/** Fetches every fixture in a division+season at once (all matchweeks) -- powers the Fixtures page's collapsible-by-matchweek list, so the calendar and the list are always derived from the same data instead of two separate fetches that could drift out of sync. */
export async function getFixturesForSeason(leagueId: number, seasonId: number): Promise<FixtureWithNames[]> {
  const { data, error } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, league_id, season_id, home_team_id, away_team_id,
      kickoff_date, kickoff_time, matchweek, status,
      predicted_home_goals, predicted_away_goals,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .order('kickoff_date', { ascending: true })
    .order('kickoff_time', { ascending: true, nullsFirst: true });
  if (error) throw error;

  const fixtures = (data ?? []).map((row: any) => ({
    fixture_id: row.fixture_id,
    league_id: row.league_id,
    season_id: row.season_id,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    kickoff_date: row.kickoff_date,
    kickoff_time: row.kickoff_time,
    matchweek: row.matchweek,
    status: row.status,
    predicted_home_goals: row.predicted_home_goals,
    predicted_away_goals: row.predicted_away_goals,
  }));
  return attachResults(fixtures, leagueId, seasonId);
}

/**
 * Matches-sourced counterpart to getFixturesForSeason, for a division+
 * season with no rows in `fixtures` at all (a fully historic, completed
 * season -- see getMatchesForTeamAsFixtures for the same reasoning).
 * `matchweek` is always null here since `matches` doesn't carry that
 * column; the Fixtures page groups by month instead when this is what's
 * powering the list.
 */
export async function getMatchesForSeasonAsFixtures(leagueId: number, seasonId: number): Promise<FixtureWithNames[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      match_id, league_id, season_id, home_team_id, away_team_id,
      match_date, kickoff_time,
      full_time_home_goals, full_time_away_goals, half_time_home_goals, half_time_away_goals,
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .order('match_date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    fixture_id: row.match_id,
    league_id: row.league_id,
    season_id: row.season_id,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    kickoff_date: row.match_date,
    kickoff_time: row.kickoff_time,
    matchweek: null,
    status: 'played',
    full_time_home_goals: row.full_time_home_goals,
    full_time_away_goals: row.full_time_away_goals,
    half_time_home_goals: row.half_time_home_goals,
    half_time_away_goals: row.half_time_away_goals,
  }));
}




// ----------------------------------------------------------------------------
// Raw source data (admin/exploration only) -- unprocessed rows exactly as
// retrieved from each provider, powering the Source Data page. Deliberately
// kept separate from every function above: no analytics page reads from
// here, and nothing here should assume a fixed set of competitions,
// seasons, or columns -- the raw layer is expected to keep expanding
// backwards through history and eventually cover other providers.
// ----------------------------------------------------------------------------

export type { RawMatchFile, SourceMatchRow };

/**
 * Every raw source file ingested so far. One row per file (e.g. one
 * season+competition's CSV from football-data.co.uk), with row_count and
 * column_names already computed at ingestion time -- column_names is
 * authoritative for what that specific file contains, so the UI never
 * needs to infer columns by sampling rows.
 */
export async function getRawMatchFiles(): Promise<RawMatchFile[]> {
  const { data, error } = await supabase
    .from('raw_match_files')
    .select('*')
    .order('season_label', { ascending: false })
    .order('competition_code', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Every row belonging to one source file, verbatim. raw_data is the
 * complete original row keyed by that file's own column names -- do not
 * assume any particular key exists; read column_names from the file
 * itself (getRawMatchFiles) to know what's actually there.
 */
export async function getSourceMatchRows(rawFileId: number): Promise<SourceMatchRow[]> {
  const { data, error } = await supabase
    .from('source_match_rows')
    .select(
      'source_match_row_id, source_competition_id, raw_file_id, source_row_key, source_home_team, source_away_team, source_match_date, source_kickoff_time, source_row_number, raw_data, raw_hash, first_seen_at, last_seen_at'
    )
    .eq('raw_file_id', rawFileId)
    .order('source_match_date', { ascending: true, nullsFirst: false })
    .order('source_row_number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}
