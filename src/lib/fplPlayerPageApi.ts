// ============================================================================
// src/lib/fplPlayerPageApi.ts
//
// Data for the canonical per-player public page (/fpl/players/:slug).
// Deliberately separate from fplPlayerTableApi.ts, which fetches EVERY
// player league-wide for a matchweek range to drive a sortable table --
// a player page needs the opposite shape (one player, their whole
// season), so reusing that would mean fetching ~658 players' rows to
// display one.
//
// This is the first page in the app addressable by a stable, human- and
// machine-readable URL rather than by client-side filter state, which is
// the point: a projection of 8.7 xPts should have somewhere it can
// actually be cited from.
// ============================================================================

import { supabase } from './supabase';

const PL_LEAGUE_ID = 1;
const PL_SEASON_ID = 13;
const MODEL_VERSION = 'leaguewide_v6';

export type PlayerPageProfile = {
  fpl_player_id: number;
  slug: string;
  web_name: string;
  full_name: string;
  canonical_team_id: number | null;
  team_name: string;
  team_slug: string | null;
  position_label: string;
  price: number | null;
};

export type PlayerPageGameweek = {
  matchweek: number;
  kickoff_date: string;
  opponent_name: string;
  is_home: boolean;
  status: string;
  projected_points: number | null;
  expected_minutes: number | null;
  actual_points: number | null;
  /** When this projection was generated -- the real freshness signal for
   * this row, not the page-render time. */
  generated_at: string | null;
  model_version: string | null;
};

const POSITION_LABELS: Record<number, string> = { 1: 'Goalkeeper', 2: 'Defender', 3: 'Midfielder', 4: 'Forward' };

/** Resolves a player by their canonical slug. Returns null for an unknown
 * slug so the page can render a real 404 rather than an error state. */
export async function getPlayerBySlug(slug: string): Promise<PlayerPageProfile | null> {
  const { data, error } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, slug, web_name, first_name, second_name, element_type, now_cost, canonical_team_id, teams(display_name, slug)')
    .eq('season_id', PL_SEASON_ID)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // web_name, slug and element_type are all NULLABLE in fpl_players, though
  // none is null for the 662 current-season rows. slug is guaranteed here
  // by this query's own .eq('slug', slug) filter; the other two get
  // fallbacks rather than assertions, since a missing name or position
  // should degrade the page, not break it.
  const webName = data.web_name ?? 'Unknown player';
  const fullName = [data.first_name, data.second_name].filter(Boolean).join(' ').trim() || webName;
  return {
    fpl_player_id: data.fpl_player_id,
    slug: data.slug!,
    web_name: webName,
    full_name: fullName,
    canonical_team_id: data.canonical_team_id ?? null,
    team_name: data.teams?.display_name ?? 'Unknown',
    team_slug: data.teams?.slug ?? null,
    position_label: data.element_type != null ? (POSITION_LABELS[data.element_type] ?? 'Unknown') : 'Unknown',
    price: data.now_cost != null ? data.now_cost / 10 : null,
  };
}

/** Every gameweek for this player that has a projection and/or a real
 * result, in matchweek order -- the page's main table. */
export async function getPlayerSeason(fplPlayerId: number, teamId: number): Promise<PlayerPageGameweek[]> {
  const { data: fixtureRows, error: fixtureError } = await supabase
    .from('fixtures')
    .select('fixture_id, matchweek, kickoff_date, status, home_team_id, away_team_id, home_team:teams!fixtures_home_team_id_fkey(display_name), away_team:teams!fixtures_away_team_id_fkey(display_name)')
    .eq('league_id', PL_LEAGUE_ID)
    .eq('season_id', PL_SEASON_ID)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .not('matchweek', 'is', null)
    .order('matchweek', { ascending: true });
  if (fixtureError) throw fixtureError;
  const fixtures = (fixtureRows ?? []);
  if (fixtures.length === 0) return [];

  const fixtureIds = fixtures.map((f) => f.fixture_id);

  const { data: projRows, error: projError } = await supabase
    .from('fpl_player_projections')
    .select('fixture_id, expected_fpl_points, expected_minutes, generated_at, model_version')
    .eq('fpl_player_id', fplPlayerId)
    .eq('model_version', MODEL_VERSION)
    .in('fixture_id', fixtureIds);
  if (projError) throw projError;
  const projByFixture = new Map<number, any>((projRows ?? []).map((p) => [p.fixture_id, p]));

  // Actual results link via fpl_fixture_id, NOT a fixture_id column (there
  // isn't one on this table) -- verified directly that all 2,548 of this
  // season's rows join cleanly to fixtures.fixture_id on it, and it's the
  // same column fplPlayerTableApi.ts already joins on.
  const { data: actualRows, error: actualError } = await supabase
    .from('fpl_player_gameweeks')
    .select('fpl_fixture_id, total_points')
    .eq('fpl_player_id', fplPlayerId)
    .eq('season_id', PL_SEASON_ID)
    .in('fpl_fixture_id', fixtureIds);
  if (actualError) throw actualError;
  // fpl_fixture_id and total_points are both nullable in
  // fpl_player_gameweeks; a row missing either can't be keyed or scored.
  const actualByFixture = new Map<number, number>(
    (actualRows ?? [])
      .filter((a): a is typeof a & { fpl_fixture_id: number; total_points: number } =>
        a.fpl_fixture_id !== null && a.total_points !== null)
      .map((a) => [a.fpl_fixture_id, a.total_points])
  );

  return fixtures.map((f) => {
    const isHome = f.home_team_id === teamId;
    const proj = projByFixture.get(f.fixture_id);
    return {
      matchweek: f.matchweek,
      kickoff_date: f.kickoff_date,
      opponent_name: (isHome ? f.away_team?.display_name : f.home_team?.display_name) ?? 'Unknown',
      is_home: isHome,
      status: f.status,
      projected_points: proj?.expected_fpl_points != null ? Number(proj.expected_fpl_points) : null,
      expected_minutes: proj?.expected_minutes != null ? Number(proj.expected_minutes) : null,
      actual_points: actualByFixture.get(f.fixture_id) ?? null,
      generated_at: proj?.generated_at ?? null,
      model_version: proj?.model_version ?? null,
    };
  });
}

/** Slugs for every player in the season -- for the sitemap and for
 * prerendering, both of which need the full URL list up front. */
export async function getAllPlayerSlugs(): Promise<string[]> {
  const { data, error } = await supabase
    .from('fpl_players')
    .select('slug')
    .eq('season_id', PL_SEASON_ID)
    .not('slug', 'is', null);
  if (error) throw error;
  return (data ?? []).map((r) => r.slug);
}
