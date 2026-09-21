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
  /** The cross-season identity key. fpl_player_id is reassigned by FPL
   * every season, so anything spanning seasons (career record, previous
   * clubs) keys on this instead -- it's what player_identity is built
   * on. Verified non-null with a matching identity row for all 667
   * current-season players. */
  fpl_code: number | null;
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
  /** Where the projected points come from (null when there is no projection). */
  breakdown?: ProjectionBreakdown | null;
  start_probability?: number | null;
  tactical_role?: string | null;
};

// ---- Where the points come from -------------------------------------------
// fpl_player_projections holds each projection's expected points by source.
// The mapping lives HERE ONCE and is re-exported through the SSR entry, so
// the browser and static generation cannot drift apart.
export const BREAKDOWN_PARTS = [
  { key: 'xpts_appearance', label: 'Appearance' },
  { key: 'xpts_goals', label: 'Goals' },
  { key: 'xpts_assists', label: 'Assists' },
  { key: 'xpts_clean_sheet', label: 'Clean sheet' },
  { key: 'xpts_goals_conceded', label: 'Goals conceded' },
  { key: 'xpts_saves', label: 'Saves' },
  { key: 'xpts_defensive_contribution', label: 'Defensive contribution' },
  { key: 'xpts_penalties', label: 'Penalties' },
  { key: 'xpts_bonus', label: 'Bonus' },
  { key: 'xpts_cards_own_goals', label: 'Cards & own goals' },
] as const;
export type BreakdownKey = (typeof BREAKDOWN_PARTS)[number]['key'];
export type ProjectionBreakdown = Record<BreakdownKey, number>;
/** Extra columns to select alongside expected_fpl_points. */
export const PROJECTION_DETAIL_COLUMNS = [...BREAKDOWN_PARTS.map((p) => p.key), 'start_probability', 'tactical_role'].join(',');

export function projectionDetail(proj: Record<string, unknown> | null | undefined): Pick<PlayerPageGameweek, 'breakdown' | 'start_probability' | 'tactical_role'> {
  if (!proj || proj.expected_fpl_points == null) return { breakdown: null, start_probability: null, tactical_role: null };
  const breakdown = {} as ProjectionBreakdown;
  for (const p of BREAKDOWN_PARTS) breakdown[p.key] = proj[p.key] == null ? 0 : Number(proj[p.key]);
  return {
    breakdown,
    start_probability: proj.start_probability == null ? null : Number(proj.start_probability),
    tactical_role: (proj.tactical_role as string | null) ?? null,
  };
}

const POSITION_LABELS: Record<number, string> = { 1: 'Goalkeeper', 2: 'Defender', 3: 'Midfielder', 4: 'Forward' };

/** Resolves a player by their canonical slug. Returns null for an unknown
 * slug so the page can render a real 404 rather than an error state. */
export async function getPlayerBySlug(slug: string): Promise<PlayerPageProfile | null> {
  const { data, error } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, fpl_code, slug, web_name, first_name, second_name, element_type, now_cost, canonical_team_id, teams(display_name, slug)')
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
    fpl_code: data.fpl_code ?? null,
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
    // A string LITERAL: supabase-js type-checks .select() and cannot parse a
    // template. Must include every PROJECTION_DETAIL_COLUMNS entry -- a test
    // (playerPageDetail.test.ts) guards that.
    .select('fixture_id, expected_fpl_points, expected_minutes, generated_at, model_version, xpts_appearance, xpts_goals, xpts_assists, xpts_clean_sheet, xpts_goals_conceded, xpts_saves, xpts_defensive_contribution, xpts_penalties, xpts_bonus, xpts_cards_own_goals, start_probability, tactical_role')
    .eq('fpl_player_id', fplPlayerId)
    .eq('model_version', MODEL_VERSION)
    .in('fixture_id', fixtureIds);
  if (projError) throw projError;
  const projByFixture = new Map<number, any>((projRows ?? []).map((p) => [p.fixture_id, p]));

  // fpl_player_gameweeks.fpl_fixture_id is FPL'S OWN fixture id, which is
  // NOT the same number as fixtures.fixture_id -- only 35 of 376 (9.3%)
  // coincide. The previous version compared them directly and claimed in
  // a comment that they "join cleanly"; in practice roughly 91% of a
  // player's actual points silently vanished, and only the handful of
  // accidental id collisions ever showed (Haaland's GW1 was one, which is
  // why the page looked half-right rather than empty).
  //
  // fpl_fixtures is the mapping table: fpl_fixture_id -> canonical_fixture_id.
  const { data: fplFixtureRows, error: mapError } = await supabase
    .from('fpl_fixtures')
    .select('fpl_fixture_id, canonical_fixture_id')
    .eq('season_id', PL_SEASON_ID)
    .in('canonical_fixture_id', fixtureIds);
  if (mapError) throw mapError;
  const canonicalByFplFixture = new Map<number, number>(
    (fplFixtureRows ?? [])
      .filter((m): m is typeof m & { fpl_fixture_id: number; canonical_fixture_id: number } =>
        m.fpl_fixture_id !== null && m.canonical_fixture_id !== null)
      .map((m) => [m.fpl_fixture_id, m.canonical_fixture_id])
  );

  const { data: actualRows, error: actualError } = await supabase
    .from('fpl_player_gameweeks')
    .select('fpl_fixture_id, total_points')
    .eq('fpl_player_id', fplPlayerId)
    .eq('season_id', PL_SEASON_ID)
    .in('fpl_fixture_id', [...canonicalByFplFixture.keys()]);
  if (actualError) throw actualError;
  // Keyed by CANONICAL fixture id, so the lookup below matches the
  // fixture rows this page is built from.
  const actualByFixture = new Map<number, number>(
    (actualRows ?? [])
      .filter((a): a is typeof a & { fpl_fixture_id: number; total_points: number } =>
        a.fpl_fixture_id !== null && a.total_points !== null)
      .flatMap((a) => {
        const canonical = canonicalByFplFixture.get(a.fpl_fixture_id);
        return canonical === undefined ? [] : [[canonical, a.total_points] as [number, number]];
      })
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
      ...projectionDetail(proj),
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


// ---- Context for the summary panel ----------------------------------------
// Four independent sources, each allowed to fail on its own (a secondary
// panel must never break the page). Every match is by fpl_player_id except
// set pieces, which are stored by name and club -- matched on BOTH.

export type PlayerContext = {
  priceRisk: { direction: string; pressure: number; net_transfers: number } | null;
  market: { ownership_now: number; ownership_change: number; price_change: number; from_date: string } | null;
  setPieces: { type: string; rank: number }[] | null;
  fitness: { status: string; chance_next_round: number | null; news: string | null; return_date: string | null } | null;
};

async function quietly<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

export async function getPlayerContext(p: { fpl_player_id: number; web_name: string; canonical_team_id: number | null }): Promise<PlayerContext> {
  const [risk, movers, takers, injuries] = await Promise.all([
    quietly(async () => (await supabase.rpc('get_price_change_risk', { p_season_id: PL_SEASON_ID })).data ?? []),
    quietly(async () => (await supabase.rpc('get_fpl_market_movers', { p_days: 7 })).data ?? []),
    quietly(async () => (await supabase.rpc('get_set_piece_takers', { p_season_id: PL_SEASON_ID })).data ?? []),
    quietly(async () => (await supabase.rpc('get_injury_report', { p_season_id: PL_SEASON_ID })).data ?? []),
  ]);
  const r = (risk as any[] | null)?.find((x) => Number(x.fpl_player_id) === p.fpl_player_id);
  const m = (movers as any[] | null)?.find((x) => Number(x.fpl_player_id) === p.fpl_player_id);
  const i = (injuries as any[] | null)?.find((x) => Number(x.fpl_player_id) === p.fpl_player_id);
  return {
    priceRisk: r ? { direction: r.direction, pressure: Number(r.pressure), net_transfers: Number(r.net_transfers) } : risk ? { direction: 'none', pressure: 0, net_transfers: 0 } : null,
    market: m ? { ownership_now: Number(m.ownership_now), ownership_change: Number(m.ownership_change), price_change: Number(m.price_change), from_date: m.from_date } : null,
    setPieces: takers
      ? (takers as any[])
          .filter((t) => t.team_id === p.canonical_team_id && t.player_name === p.web_name)
          .map((t) => ({ type: String(t.set_piece_type), rank: Number(t.rank) }))
          .sort((a, b) => a.rank - b.rank)
      : null,
    fitness: i ? { status: i.status, chance_next_round: i.chance_next_round == null ? null : Number(i.chance_next_round), news: i.news ?? null, return_date: i.return_date ?? null }
      : injuries ? { status: 'a', chance_next_round: null, news: null, return_date: null } : null,
  };
}
