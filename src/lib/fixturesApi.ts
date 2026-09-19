// ============================================================================
// src/lib/fixturesApi.ts
//
// Scheduled fixtures, their stored pre-kickoff predictions, and the
// refresh/change tracking around them. Split out of api.ts.
//
// NOTE ON TEAM NAMES: selects read `canonical_name:display_name` --
// PostgREST column aliasing, corrected at the query boundary.
// ============================================================================

import { supabase } from './supabase';
import type { FixtureRefreshRun } from '../types/database';

export type FixtureWithNames = {
  fixture_id: number;
  /** Canonical slug for this fixture's own public page (/football/matches/:slug). */
  slug: string | null;
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
  prediction_fit_run_id?: number | null;
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
      fixture_id, slug, league_id, season_id, home_team_id, away_team_id,
      kickoff_date, kickoff_time, matchweek, status, prediction_fit_run_id,
      predicted_home_goals, predicted_away_goals,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name:display_name),
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
    slug: row.slug ?? null,
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
      home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name:display_name),
      league:leagues(code, name, competition_type)
    `
    )
    .eq('season_id', seasonId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('match_date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    fixture_id: row.match_id,
    // These rows come from `matches` (completed results), not `fixtures`,
    // so there's no fixture slug to carry -- a played match reached this
    // way has no /football/matches/:slug page of its own.
    slug: null,
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

export type EplFixtureChange = {
  change_id: number;
  home_team_name: string;
  away_team_name: string;
  old_kickoff_date: string;
  new_kickoff_date: string;
  detected_at: string;
};

/** Premier League fixture kickoff changes detected in the last N days --
 * postponements, TV-pick reschedules -- for the frontend notification
 * banner (requested directly: schedule changes affect Fantasy). Scoped
 * to E0 specifically, not every tracked division, since that's the
 * fixture set Fantasy actually depends on. Two-step lookup (E0 fixture
 * ids, then changes filtered to them) rather than a single embedded-
 * filter query, to stay on a query shape already proven reliable
 * elsewhere in this codebase. */
export async function getRecentEplFixtureChanges(withinDays = 7): Promise<EplFixtureChange[]> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: changeRows, error: changeErr } = await supabase
    .from('fixture_changes')
    .select('change_id, fixture_id, old_kickoff_date, new_kickoff_date, detected_at')
    .gte('detected_at', since)
    .order('detected_at', { ascending: false });
  if (changeErr) throw changeErr;
  if (!changeRows || changeRows.length === 0) return [];

  const fixtureIds = changeRows.map((r: any) => r.fixture_id);
  const { data: fixtureRows, error: fixtureErr } = await supabase
    .from('fixtures')
    .select('fixture_id, league_id, home_team:teams!fixtures_home_team_id_fkey(canonical_name:display_name), away_team:teams!fixtures_away_team_id_fkey(canonical_name:display_name)')
    .in('fixture_id', fixtureIds);
  if (fixtureErr) throw fixtureErr;
  const fixtureById = new Map<number, any>((fixtureRows ?? []).map((f: any) => [f.fixture_id, f]));

  return (changeRows as any[])
    .filter((r) => fixtureById.get(r.fixture_id)?.league_id === 1)
    .map((r) => {
      const fx = fixtureById.get(r.fixture_id);
      return {
        change_id: r.change_id,
        home_team_name: fx?.home_team?.canonical_name ?? 'Unknown',
        away_team_name: fx?.away_team?.canonical_name ?? 'Unknown',
        old_kickoff_date: r.old_kickoff_date,
        new_kickoff_date: r.new_kickoff_date,
        detected_at: r.detected_at,
      };
    });
}

/** Most recent fixture-refresh runs (any status), newest first -- for the Data Health page's "fixtures changed" section. */
export async function getRecentFixtureRefreshRuns(limit = 10): Promise<FixtureRefreshRun[]> {
  const { data, error } = await supabase
    .from('fixture_refresh_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Head-to-head record for every fixture in a matchweek, in one call.
 *
 * The per-pair getHeadToHead() suits Match Preview but not a fixture
 * list -- ten fixtures would be ten round trips before the page renders.
 *
 * Counts span every competition and season in the archive: "we never
 * beat them" is a claim about history, not about this season. */
export type FixtureHeadToHead = {
  fixture_id: number;
  meetings: number;
  home_wins: number;
  draws: number;
  away_wins: number;
  last_meeting_date: string | null;
  last_home_goals: number | null;
  last_away_goals: number | null;
  last_home_was_fixture_home: boolean | null;
};

export async function getMatchweekHeadToHead(
  leagueId: number,
  seasonId: number,
  matchweek?: number
): Promise<Map<number, FixtureHeadToHead>> {
  const { data, error } = await supabase.rpc('get_matchweek_head_to_head', {
    p_league_id: leagueId,
    p_season_id: seasonId,
    // DEFAULT NULL in SQL -- omit rather than pass an explicit null.
    p_matchweek: matchweek,
  });
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [
      Number(r.fixture_id),
      {
        ...r,
        fixture_id: Number(r.fixture_id),
        meetings: Number(r.meetings),
        home_wins: Number(r.home_wins),
        draws: Number(r.draws),
        away_wins: Number(r.away_wins),
      } as FixtureHeadToHead,
    ])
  );
}

/** rho per accepted fit run, so a fixture's frozen prediction can be
 * turned back into a full score grid.
 *
 * Small enough to fetch whole (tens of rows) rather than joining per
 * fixture, and fixtures reference their fit run by id so the pairing
 * stays exact -- using the LATEST rho would silently re-model an old
 * prediction with today's parameters. */

export async function getFixturesForSeason(leagueId: number, seasonId: number): Promise<FixtureWithNames[]> {
  const { data, error } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, slug, league_id, season_id, home_team_id, away_team_id,
      kickoff_date, kickoff_time, matchweek, status, prediction_fit_run_id,
      predicted_home_goals, predicted_away_goals,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name:display_name)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .order('kickoff_date', { ascending: true })
    .order('kickoff_time', { ascending: true, nullsFirst: true });
  if (error) throw error;

  const fixtures = (data ?? []).map((row: any) => ({
    fixture_id: row.fixture_id,
    slug: row.slug ?? null,
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
      home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name:display_name)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .order('match_date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    fixture_id: row.match_id,
    // These rows come from `matches` (completed results), not `fixtures`,
    // so there's no fixture slug to carry -- a played match reached this
    // way has no /football/matches/:slug page of its own.
    slug: null,
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




