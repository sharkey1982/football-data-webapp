// ============================================================================
// src/lib/fplCompareApi.ts
//
// Data for /fpl/compare: up to five players side by side over a gameweek
// range. Reads the same projection rows as Player Projections (current
// model_version, baseline scenario), whose start chances and minutes are the
// ones Minutes Outlook shows, so every number here matches a number on those
// pages -- no second calculation of anything.
// ============================================================================

import { supabase } from './supabase';
import { CURRENT_MODEL_VERSION, FPL_POSITION_LABEL } from './fplApi';
import { getCurrentFplSeasonId } from './currentSeason';

export const MAX_COMPARE = 5;

export type ComparePlayerOption = {
  fpl_player_id: number;
  slug: string;
  web_name: string;
  full_name: string;
  position: string;
  team_id: number;
  team_name: string;
  price: number;
};

export type CompareFixture = {
  fixture_id: number;
  matchweek: number;
  opponent_name: string;
  /** FPL's three-letter code (MCI, MUN...), falling back to the name's first three letters. */
  opponent_short: string;
  is_home: boolean;
  /** FPL's own difficulty rating for this player's team, 1-5. */
  fdr: number | null;
};

export type CompareWeek = {
  matchweek: number;
  fixtures: CompareFixture[];
  /** Summed over the gameweek's fixtures (0, 1 or 2). */
  xpts: number;
  xg: number;
  xa: number;
  minutes: number;
  /** Mean over the gameweek's fixtures. */
  start: number | null;
};

export type ComparePlayer = ComparePlayerOption & {
  status: string | null;
  news: string | null;
  chance_next: number | null;
  ownership: number | null;
  season_points: number | null;
  season_minutes: number | null;
  season_xg: number | null;
  season_xa: number | null;
  /** Minutes Outlook's slug for this player's club (for the link). */
  team_slug: string | null;
  weeks: CompareWeek[];
  totals: { xpts: number; xg: number; xa: number; minutes: number; start: number | null; fixtures: number };
  generated_at: string | null;
};

/** Every player this season, for the picker (about 700 rows). */
export async function getComparePlayerOptions(): Promise<ComparePlayerOption[]> {
  const seasonId = await getCurrentFplSeasonId();
  const [{ data: players, error }, { data: teams, error: teamError }] = await Promise.all([
    supabase
      .from('fpl_players')
      .select('fpl_player_id, slug, web_name, first_name, second_name, element_type, canonical_team_id, now_cost')
      .eq('season_id', seasonId),
    supabase.from('teams').select('team_id, display_name'),
  ]);
  if (error) throw error;
  if (teamError) throw teamError;
  const teamName = new Map((teams ?? []).map((t: any) => [t.team_id, t.display_name as string]));
  return ((players ?? []) as any[])
    .filter((p) => p.slug && p.canonical_team_id != null)
    .map((p) => ({
      fpl_player_id: p.fpl_player_id,
      slug: p.slug,
      web_name: p.web_name,
      full_name: `${p.first_name ?? ''} ${p.second_name ?? ''}`.trim(),
      position: FPL_POSITION_LABEL[p.element_type as 1 | 2 | 3 | 4] ?? '',
      team_id: p.canonical_team_id,
      team_name: teamName.get(p.canonical_team_id) ?? '',
      price: Number(p.now_cost) / 10,
    }))
    .sort((a, b) => a.web_name.localeCompare(b.web_name));
}

const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Compares the given players (by slug, in order) from fromGw to toGw. */
export async function getComparison(slugs: string[], fromGw: number, toGw: number): Promise<ComparePlayer[]> {
  const wanted = [...new Set(slugs)].slice(0, MAX_COMPARE);
  if (wanted.length === 0) return [];
  const seasonId = await getCurrentFplSeasonId();

  const { data: playerRows, error: playerError } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, slug, web_name, first_name, second_name, element_type, canonical_team_id, now_cost, status, news, chance_of_playing_next_round, selected_by_percent, total_points, minutes, expected_goals, expected_assists')
    .eq('season_id', seasonId)
    .in('slug', wanted);
  if (playerError) throw playerError;
  const players = (playerRows ?? []) as any[];
  if (players.length === 0) return [];

  const teamIds = [...new Set(players.map((p) => p.canonical_team_id))];
  const [{ data: teams, error: teamError }, { data: fixtureRows, error: fixtureError }, { data: fplTeams }] = await Promise.all([
    supabase.from('teams').select('team_id, display_name').in('team_id', teamIds),
    supabase
      .from('fixtures')
      .select('fixture_id, matchweek, home_team_id, away_team_id, home_team:teams!fixtures_home_team_id_fkey(display_name), away_team:teams!fixtures_away_team_id_fkey(display_name)')
      .eq('league_id', 1)
      .eq('season_id', seasonId)
      .gte('matchweek', fromGw)
      .lte('matchweek', toGw),
    // Short codes only label the fixture chips, so a failure falls back quietly.
    Promise.resolve(supabase.from('fpl_teams').select('canonical_team_id, short_name').eq('season_id', seasonId)).catch(() => ({ data: null })),
  ]);
  if (teamError) throw teamError;
  if (fixtureError) throw fixtureError;
  const teamName = new Map((teams ?? []).map((t: any) => [t.team_id, t.display_name as string]));
  const fixtures = (fixtureRows ?? []) as any[];
  const shortName = new Map<number, string>(((fplTeams ?? []) as any[]).filter((t) => t.canonical_team_id != null).map((t) => [t.canonical_team_id, t.short_name]));
  const fixtureIds = fixtures.map((f) => f.fixture_id);

  const ids = players.map((p) => p.fpl_player_id);
  const [{ data: projRows, error: projError }, { data: fdrRows, error: fdrError }, outlookTeams] = await Promise.all([
    fixtureIds.length
      ? supabase
          .from('fpl_player_projections')
          .select('fpl_player_id, fixture_id, expected_fpl_points, expected_goals, expected_assists, expected_minutes, start_probability, generated_at')
          .eq('model_version', CURRENT_MODEL_VERSION)
          .eq('scenario_key', 'baseline')
          .in('fpl_player_id', ids)
          .in('fixture_id', fixtureIds)
      : Promise.resolve({ data: [], error: null }),
    fixtureIds.length
      ? supabase
          .from('fpl_fixtures')
          .select('canonical_fixture_id, team_h_difficulty, team_a_difficulty')
          .eq('season_id', seasonId)
          .in('canonical_fixture_id', fixtureIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.resolve((supabase as any).rpc('get_fpl_minutes_teams') as Promise<{ data: any[] | null }>)
      .then(({ data }) => (data ?? []) as any[])
      .catch(() => [] as any[]),
  ]);
  if (projError) throw projError;
  if (fdrError) throw fdrError;

  const fdrByFixture = new Map<number, { h: number | null; a: number | null }>();
  for (const r of (fdrRows ?? []) as any[]) fdrByFixture.set(r.canonical_fixture_id, { h: r.team_h_difficulty, a: r.team_a_difficulty });
  const teamSlug = new Map<number, string>(outlookTeams.map((t: any) => [t.team_id, t.slug]));
  const projByKey = new Map<string, any>();
  for (const r of (projRows ?? []) as any[]) projByKey.set(`${r.fpl_player_id}:${r.fixture_id}`, r);

  const result = players.map((p) => {
    const teamId = p.canonical_team_id;
    const own = fixtures
      .filter((f) => f.home_team_id === teamId || f.away_team_id === teamId)
      .sort((a, b) => a.matchweek - b.matchweek || a.fixture_id - b.fixture_id);
    const weeks: CompareWeek[] = [];
    let generatedAt: string | null = null;
    for (let gw = fromGw; gw <= toGw; gw++) {
      const gwFixtures = own.filter((f) => f.matchweek === gw);
      const week: CompareWeek = { matchweek: gw, fixtures: [], xpts: 0, xg: 0, xa: 0, minutes: 0, start: null };
      const starts: number[] = [];
      for (const f of gwFixtures) {
        const isHome = f.home_team_id === teamId;
        const fdr = fdrByFixture.get(f.fixture_id);
        const opponentName: string = (isHome ? f.away_team?.display_name : f.home_team?.display_name) ?? '';
        week.fixtures.push({
          fixture_id: f.fixture_id,
          matchweek: gw,
          opponent_name: opponentName,
          opponent_short: shortName.get(isHome ? f.away_team_id : f.home_team_id) ?? opponentName.slice(0, 3).toUpperCase(),
          is_home: isHome,
          fdr: fdr ? (isHome ? fdr.h : fdr.a) : null,
        });
        const proj = projByKey.get(`${p.fpl_player_id}:${f.fixture_id}`);
        if (proj) {
          week.xpts += n(proj.expected_fpl_points);
          week.xg += n(proj.expected_goals);
          week.xa += n(proj.expected_assists);
          week.minutes += n(proj.expected_minutes);
          if (proj.start_probability != null) starts.push(Number(proj.start_probability));
          if (proj.generated_at && (!generatedAt || proj.generated_at > generatedAt)) generatedAt = proj.generated_at;
        }
      }
      week.start = starts.length ? starts.reduce((s, v) => s + v, 0) / starts.length : null;
      weeks.push(week);
    }
    const played = weeks.filter((w) => w.start != null);
    const allStarts = played.map((w) => w.start as number);
    return {
      fpl_player_id: p.fpl_player_id,
      slug: p.slug,
      web_name: p.web_name,
      full_name: `${p.first_name ?? ''} ${p.second_name ?? ''}`.trim(),
      position: FPL_POSITION_LABEL[p.element_type as 1 | 2 | 3 | 4] ?? '',
      team_id: teamId,
      team_name: teamName.get(teamId) ?? '',
      price: Number(p.now_cost) / 10,
      status: p.status ?? null,
      news: p.news || null,
      chance_next: p.chance_of_playing_next_round ?? null,
      ownership: p.selected_by_percent != null ? Number(p.selected_by_percent) : null,
      season_points: p.total_points ?? null,
      season_minutes: p.minutes ?? null,
      season_xg: p.expected_goals != null ? Number(p.expected_goals) : null,
      season_xa: p.expected_assists != null ? Number(p.expected_assists) : null,
      team_slug: teamSlug.get(teamId) ?? null,
      weeks,
      totals: {
        xpts: weeks.reduce((s, w) => s + w.xpts, 0),
        xg: weeks.reduce((s, w) => s + w.xg, 0),
        xa: weeks.reduce((s, w) => s + w.xa, 0),
        minutes: weeks.reduce((s, w) => s + w.minutes, 0),
        start: allStarts.length ? allStarts.reduce((s, v) => s + v, 0) / allStarts.length : null,
        fixtures: weeks.reduce((s, w) => s + w.fixtures.length, 0),
      },
      generated_at: generatedAt,
    } satisfies ComparePlayer;
  });

  // Keep the order the slugs were given in (the order the user picked them).
  const order = new Map(wanted.map((s, i) => [s, i]));
  return result.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
}

/** xG per 90 of expected minutes; null with too few minutes to mean anything. */
export function per90(value: number, minutes: number): number | null {
  return minutes >= 45 ? (value / minutes) * 90 : null;
}

/** Parses ?players=a,b,c into at most MAX_COMPARE unique slugs. */
export function parsePlayersParam(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_COMPARE);
}
