// ============================================================================
// src/lib/fplSeasonApi.ts
//
// Data-access layer for the season/gameweek FPL projections browser
// (Season -> Gameweek -> Fixture -> Player). Reads only the two new
// frontend-facing season feed views -- never internal modelling tables --
// per the season projections brief. The existing single-fixture screen
// (fplApi.ts, FixtureProjectionPage) is untouched; this module is
// additive.
//
// IMPORTANT: expected FPL points (xPts) are NEVER computed here from
// shrunk_xg90/expected_goals/etc -- those are model inputs, not points.
// xPts is merged in from the existing production fpl_player_projections
// feed (model_version = leaguewide_v4) only where it already exists; when
// it doesn't (most of the season, at least early on), the field is left
// null and the UI shows "not yet modelled" rather than a computed guess.
// ============================================================================

import { supabase } from './supabase';
import { num, FPL_POSITION_LABEL } from './fplApi';
import type { FplElementType } from '../types/database';

/** The model_version the production xPts feed currently uses league-wide. */
export const SEASON_XPTS_MODEL_VERSION = 'leaguewide_v4';

export type SeasonGameweekSummary = {
  matchweek: number;
  first_kickoff: string;
  last_kickoff: string;
  fixture_count: number;
  played_count: number;
};

/**
 * One row per gameweek (38 total), aggregated -- deliberately cheap: this
 * is what powers the season-wide GW picker without ever pulling all 380
 * fixtures' full detail on load.
 */
export async function getSeasonSummary(): Promise<SeasonGameweekSummary[]> {
  const { data, error } = await supabase
    .from('fpl_season_fixture_feed')
    .select('matchweek, kickoff_date, status')
    .order('matchweek', { ascending: true });
  if (error) throw error;

  const byWeek = new Map<number, { dates: string[]; played: number; total: number }>();
  for (const row of data ?? []) {
    const entry = byWeek.get(row.matchweek) ?? { dates: [], played: 0, total: 0 };
    entry.dates.push(row.kickoff_date);
    entry.total += 1;
    if (row.status === 'played') entry.played += 1;
    byWeek.set(row.matchweek, entry);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([matchweek, entry]) => ({
      matchweek,
      first_kickoff: entry.dates.reduce((a, b) => (a < b ? a : b)),
      last_kickoff: entry.dates.reduce((a, b) => (a > b ? a : b)),
      fixture_count: entry.total,
      played_count: entry.played,
    }));
}

/**
 * The "current/next relevant" gameweek: the earliest matchweek that still
 * has at least one unplayed fixture. Falls back to the final matchweek if
 * the whole season is complete.
 */
export async function getDefaultMatchweek(): Promise<number> {
  const { data: upcoming, error: upcomingError } = await supabase
    .from('fpl_season_fixture_feed')
    .select('matchweek')
    .eq('status', 'scheduled')
    .order('matchweek', { ascending: true })
    .limit(1);
  if (upcomingError) throw upcomingError;
  if (upcoming && upcoming.length > 0) return upcoming[0].matchweek;

  const { data: last, error: lastError } = await supabase
    .from('fpl_season_fixture_feed')
    .select('matchweek')
    .order('matchweek', { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  return last && last.length > 0 ? last[0].matchweek : 1;
}

export type SeasonFixture = {
  fixture_id: number;
  matchweek: number;
  kickoff_date: string;
  kickoff_time: string | null;
  status: string;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
  has_projection: boolean;
};

/** All fixtures in one gameweek, kickoff order. */
export async function getGameweekFixtures(matchweek: number): Promise<SeasonFixture[]> {
  const { data, error } = await supabase
    .from('fpl_season_fixture_feed')
    .select('*')
    .eq('matchweek', matchweek)
    .order('kickoff_date', { ascending: true })
    .order('kickoff_time', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((f) => ({
    fixture_id: f.fixture_id,
    matchweek: f.matchweek,
    kickoff_date: f.kickoff_date,
    kickoff_time: f.kickoff_time,
    status: f.status,
    home_team_id: f.home_team_id,
    home_team: f.home_team,
    away_team_id: f.away_team_id,
    away_team: f.away_team,
    predicted_home_goals: num(f.predicted_home_goals),
    predicted_away_goals: num(f.predicted_away_goals),
    has_projection: f.has_projection,
  }));
}

export type SeasonPlayerProjection = {
  fixture_id: number;
  matchweek: number;
  kickoff_date: string;
  team_id: number;
  team_name: string;
  web_name: string;
  fpl_player_id: number;
  fpl_position: FplElementType | null;
  fpl_position_label: string;
  tactical_role: string | null;
  expected_minutes: number | null;
  start_probability: number | null;
  sub_appearance_probability: number | null;
  shrunk_xg90: number | null;
  shrunk_xa90: number | null;
  expected_goals: number | null;
  expected_assists: number | null;
  clean_sheet_probability: number | null;
  defensive_contribution_probability: number | null;
  experimental_expected_bonus: number | null;
  /** From the production xPts feed only -- null where that model hasn't covered this fixture yet. Never computed client-side. */
  expected_fpl_points: number | null;
  /**
   * True when the fixture has already been played -- this projection is
   * the current model recalculating retrospectively, NOT an archived
   * pre-match forecast. The UI must not present it as the latter.
   */
  is_retrospective: boolean;
};

/**
 * Player projections for a gameweek, optionally narrowed to one fixture
 * within it. team_names maps team_id -> display name (build this from the
 * gameweek's own fixture list -- every player's team is playing in one of
 * that gameweek's fixtures, so a second query isn't needed).
 */
export async function getGameweekPlayerProjections(
  matchweek: number,
  teamNames: Map<number, string>,
  fixtureId?: number
): Promise<SeasonPlayerProjection[]> {
  let query = supabase.from('fpl_season_player_projection_feed').select('*').eq('matchweek', matchweek);
  if (fixtureId !== undefined) query = query.eq('fixture_id', fixtureId);
  const { data: projections, error } = await query;
  if (error) throw error;

  const fixtureIds = [...new Set((projections ?? []).map((p) => p.fixture_id))];
  const statusByFixture = new Map<number, string>();
  if (fixtureIds.length > 0) {
    const { data: fixtureRows, error: fixtureError } = await supabase
      .from('fpl_season_fixture_feed')
      .select('fixture_id, status')
      .in('fixture_id', fixtureIds);
    if (fixtureError) throw fixtureError;
    for (const f of fixtureRows ?? []) statusByFixture.set(f.fixture_id, f.status);
  }

  const playerIds = [...new Set((projections ?? []).map((p) => p.fpl_player_id))];
  const xptsByKey = new Map<string, number>();
  if (playerIds.length > 0 && fixtureIds.length > 0) {
    const { data: xptsRows, error: xptsError } = await supabase
      .from('fpl_player_projections')
      .select('fixture_id, fpl_player_id, expected_fpl_points')
      .eq('model_version', SEASON_XPTS_MODEL_VERSION)
      .in('fixture_id', fixtureIds)
      .in('fpl_player_id', playerIds);
    if (xptsError) throw xptsError;
    for (const row of xptsRows ?? []) {
      const v = num(row.expected_fpl_points);
      if (v !== null) xptsByKey.set(`${row.fixture_id}:${row.fpl_player_id}`, v);
    }
  }

  return (projections ?? []).map((p) => ({
    fixture_id: p.fixture_id,
    matchweek: p.matchweek,
    kickoff_date: p.kickoff_date,
    team_id: p.team_id,
    team_name: teamNames.get(p.team_id) ?? 'Unknown',
    web_name: p.web_name,
    fpl_player_id: p.fpl_player_id,
    fpl_position: p.fpl_position,
    fpl_position_label: p.fpl_position ? FPL_POSITION_LABEL[p.fpl_position] : '\u2014',
    tactical_role: p.tactical_role,
    expected_minutes: num(p.expected_minutes),
    start_probability: num(p.start_probability),
    sub_appearance_probability: num(p.sub_appearance_probability),
    shrunk_xg90: num(p.shrunk_xg90),
    shrunk_xa90: num(p.shrunk_xa90),
    expected_goals: num(p.expected_goals),
    expected_assists: num(p.expected_assists),
    clean_sheet_probability: num(p.clean_sheet_probability),
    defensive_contribution_probability: num(p.defensive_contribution_probability),
    experimental_expected_bonus: num(p.experimental_expected_bonus),
    expected_fpl_points: xptsByKey.get(`${p.fixture_id}:${p.fpl_player_id}`) ?? null,
    is_retrospective: statusByFixture.get(p.fixture_id) === 'played',
  }));
}
