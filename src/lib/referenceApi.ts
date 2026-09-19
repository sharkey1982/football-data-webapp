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

  let query = (supabase as any).from('teams').select('team_id, canonical_name:display_name, country_id, slug');
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
  const { data, error } = await (supabase as any)
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
  const { data, error } = await (supabase as any)
    .from('fixtures')
    .select('home_team_id, away_team_id, home_team:teams!fixtures_home_team_id_fkey(canonical_name:display_name, slug), away_team:teams!fixtures_away_team_id_fkey(canonical_name:display_name, slug)')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId);
  if (error) throw error;

  const teamsById = new Map<number, { canonical_name: string; slug: string }>();
  for (const row of (data ?? []) as any[]) {
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

