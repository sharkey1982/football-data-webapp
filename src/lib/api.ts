// ============================================================================
// src/lib/api.ts
//
// Data-access layer. Every Supabase query the pages need lives here, so
// pages stay focused on rendering and this file stays the single place to
// look when a query needs changing.
// ============================================================================

import { supabase } from './supabase';
import type { Match, MatchResult } from '../types/database';

export type MatchWithNames = Match & {
  home_team_name: string;
  away_team_name: string;
  league_code: string;
  league_name: string;
  season_label: string;
};

// ----------------------------------------------------------------------------
// Reference data
// ----------------------------------------------------------------------------

export async function getLeagues() {
  const { data, error } = await supabase
    .from('leagues')
    .select('league_id, code, name, tier, country_id')
    .order('tier', { ascending: true, nullsFirst: false });
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

export async function getTeams(searchQuery?: string) {
  let query = supabase.from('teams').select('team_id, canonical_name, country_id');
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
// Fixtures (scheduled, not-yet-played matches)
// ----------------------------------------------------------------------------

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
};

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

/** Fetches all fixtures for a specific matchweek, with team names joined in. */
export async function getFixturesForMatchweek(
  leagueId: number,
  seasonId: number,
  matchweek: number
): Promise<FixtureWithNames[]> {
  const { data, error } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, league_id, season_id, home_team_id, away_team_id,
      kickoff_date, kickoff_time, matchweek, status,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .eq('matchweek', matchweek)
    .order('kickoff_date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
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
  }));
}


