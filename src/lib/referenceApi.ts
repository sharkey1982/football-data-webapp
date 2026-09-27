// ============================================================================
// src/lib/referenceApi.ts
//
// Reference data: leagues, countries, seasons, teams and team categories.
// The slow-moving lookups most pages need before they can ask anything
// else, split out of api.ts.
//
// NOTE ON TEAM NAMES: selects read `canonical_name:display_name` --
// PostgREST column aliasing. teams.canonical_name is the DATA-SOURCE
// name used to match football-data.co.uk rows; display_name is the
// public one, corrected at the query boundary.
// ============================================================================

import { supabase } from './supabase';
import { getHeadToHead } from './matchesApi';

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

/** Countries a league/team can belong to -- powers the Country filter.
 * Sorted by how many of that country's teams actually have match data,
 * not alphabetically: most "countries" here exist only because one club
 * appeared in a single continental-cup fixture (a handful of matches at
 * most), and alphabetical order buried England and Spain -- real leagues
 * with real coverage -- among dozens of those. Alphabetical only breaks
 * ties. */
export async function getCountries() {
  // Newer than the generated types -- see the function's own comment.
  const rpc = (supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }).rpc.bind(supabase);
  const { data, error } = await rpc('get_countries_by_relevance');
  if (error) throw error;
  return ((data ?? []) as { country_id: number; name: string; code: string | null }[]).map((c) => ({
    country_id: c.country_id,
    name: c.name,
    code: c.code,
  }));
}

/** league_ids with at least one row in `matches`. Lets a filter offer only
 * options that lead to real data -- a country or division with no results
 * would just render an empty table. */
export async function getLeagueIdsWithResults(): Promise<number[]> {
  // Newer than the generated types.
  const rpc = (supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }).rpc.bind(supabase);
  const { data, error } = await rpc('get_league_ids_with_results');
  if (error) throw error;
  return ((data ?? []) as (number | { get_league_ids_with_results: number })[]).map((r) =>
    typeof r === 'number' ? r : r.get_league_ids_with_results
  );
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

  let query = supabase.from('teams').select('team_id, canonical_name:display_name, country_id, slug');
  if (options?.countryId) query = query.eq('country_id', options.countryId);
  if (searchQuery && searchQuery.trim() !== '') {
    query = query.ilike('display_name', `%${searchQuery.trim()}%`);
  }
  const { data, error } = await query.order('display_name', { ascending: true });
  if (error) throw error;
  return data;
}

/** Resolves a team's canonical slug (the stable public URL segment) to its
 * id and name -- for /football/teams/:slug, the durable per-team route
 * recommended in the AI/search discoverability audit (client-side state
 * with no URL at all previously). */
export async function getTeamBySlug(slug: string): Promise<{ team_id: number; canonical_name: string; slug: string } | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('team_id, canonical_name:display_name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Finds the most recent season that has fixture data for a league --
 * used to determine "the current season" for team-picker purposes without
 * hardcoding a season label. "Most recent" is by start_year: season_id is
 * not in date order (historic seasons 1992/93-2013/14 are ids 14-35).
 */
export async function getMostRecentFixtureSeason(leagueId: number) {
  const { data, error } = await supabase
    .from('seasons')
    .select('season_id, label, start_year, fixtures!inner(fixture_id)')
    .eq('fixtures.league_id', leagueId)
    .order('start_year', { ascending: false })
    .limit(1)
    .limit(1, { referencedTable: 'fixtures' })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { season_id: data.season_id as number, label: data.label as string, start_year: data.start_year as number };
}

// Newer than the generated types (added 2026-09-27).
type EraNameRow = { league_id: number; name: string };
const eraNames = () =>
  (supabase as unknown as {
    from: (t: 'league_season_display_names') => {
      select: (c: string) => {
        eq: (col: string, v: number) => PromiseLike<{ data: EraNameRow[] | null; error: unknown }> & {
          eq: (col: string, v: number) => { maybeSingle: () => PromiseLike<{ data: EraNameRow | null; error: unknown }> };
        };
      };
    };
  }).from('league_season_display_names');

/**
 * Every division's name in one season, keyed by league_id -- e.g. E1 in
 * 1998/99 is "First Division", not today's "Championship". Leagues whose
 * name never changed come back with today's name. Read from
 * league_season_display_names (league_season_names + leagues.name).
 */
export async function getLeagueNamesForSeason(seasonId: number): Promise<Map<number, string>> {
  const { data, error } = await eraNames().select('league_id, name').eq('season_id', seasonId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [Number(r.league_id), String(r.name)]));
}

/** One division's name in one season (null if the pair is unknown). */
export async function getLeagueNameForSeason(leagueId: number, seasonId: number): Promise<string | null> {
  const { data, error } = await eraNames().select('league_id, name').eq('season_id', seasonId).eq('league_id', leagueId).maybeSingle();
  if (error) throw error;
  return data ? String(data.name) : null;
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
    .select('home_team_id, away_team_id, home_team:teams!fixtures_home_team_id_fkey(canonical_name:display_name, slug), away_team:teams!fixtures_away_team_id_fkey(canonical_name:display_name, slug)')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId);
  if (error) throw error;

  const teamsById = new Map<number, { canonical_name: string; slug: string }>();
  for (const row of (data ?? [])) {
    teamsById.set(row.home_team_id, { canonical_name: row.home_team?.canonical_name ?? 'Unknown', slug: row.home_team?.slug ?? '' });
    teamsById.set(row.away_team_id, { canonical_name: row.away_team?.canonical_name ?? 'Unknown', slug: row.away_team?.slug ?? '' });
  }

  return [...teamsById.entries()]
    .map(([team_id, t]) => ({ team_id, canonical_name: t.canonical_name, slug: t.slug }))
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
}

export async function getTeamById(teamId: number) {
  const { data, error } = await supabase
    .from('teams')
    .select('team_id, canonical_name:display_name, country_id')
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
    .select('team_id, team:teams(canonical_name:display_name)')
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

