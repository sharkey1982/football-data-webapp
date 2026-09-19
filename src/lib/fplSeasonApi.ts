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
import { num, FPL_POSITION_LABEL, CURRENT_MODEL_VERSION } from './fplApi';
import type { FplElementType } from '../types/database';

/** FPL encodes position as 1-4 (GKP/DEF/MID/FWD). Postgres stores it as a
 * plain int, so generated types widen it to `number`; this narrows it back
 * without asserting, returning null for anything outside the known set. */
function asElementType(v: number | null): FplElementType | null {
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : null;
}

/** The model_version the production xPts feed currently uses league-wide -- re-exported from fplApi.ts's single source of truth so the two screens never disagree. */
export const SEASON_XPTS_MODEL_VERSION = CURRENT_MODEL_VERSION;

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
    // fixtures.matchweek is NULLABLE in the schema (24 fixtures across
    // other leagues/seasons have no matchweek). This view's WHERE clause
    // happens to exclude all of them today, but nothing guarantees that,
    // so skip rather than assert -- a null here would otherwise become a
    // Map key and silently corrupt the gameweek grouping.
    // kickoff_date IS NOT NULL in fixtures, so it needs no such guard.
    if (row.matchweek === null) continue;
    const entry = byWeek.get(row.matchweek) ?? { dates: [], played: 0, total: 0 };
    entry.dates.push(row.kickoff_date!);
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
 * has at least one unplayed fixture, guaranteed to actually have
 * projection data available. Backed by get_fpl_default_matchweek(), which
 * falls back to the nearest gameweek WITH data if the genuinely-next
 * scheduled week hasn't been generated yet -- combines what used to be
 * two separate, sometimes-inconsistent answers (this function's own prior
 * fixtures.status-only logic, and the optimiser's separate
 * projection-data-only logic) into one canonical source every page uses.
 */
export async function getDefaultMatchweek(): Promise<number> {
  // get_fpl_default_matchweek is new enough the generated Database type
  // doesn't know its params yet -- scoped `as any`, matching the
  // "deliberately untyped RPC" convention used elsewhere in this project.
  const { data, error } = await supabase.rpc('get_fpl_default_matchweek', { p_season_id: 13, p_league_id: 1 });
  if (error) throw error;
  return typeof data === 'number' ? data : 1;
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

  // Non-null assertions below are justified per column, not blanket:
  //   fixture_id, kickoff_date, status  -- NOT NULL in fixtures
  //   home_team/away_team, *_team_id    -- reached via plain (inner) JOIN
  //                                        onto teams, and NOT NULL there
  //   has_projection                    -- a CASE that always yields t/f
  //   matchweek                         -- nullable in fixtures, but this
  //                                        query filters .eq('matchweek', n)
  //                                        so any returned row has it set
  // predicted_* are genuinely nullable and stay so. PostgREST types every
  // view column as nullable because it can't see any of this from the SQL.
  return (data ?? []).map((f) => ({
    fixture_id: f.fixture_id!,
    matchweek: f.matchweek!,
    kickoff_date: f.kickoff_date!,
    kickoff_time: f.kickoff_time,
    status: f.status!,
    home_team_id: f.home_team_id!,
    home_team: f.home_team!,
    away_team_id: f.away_team_id!,
    away_team: f.away_team!,
    predicted_home_goals: num(f.predicted_home_goals),
    predicted_away_goals: num(f.predicted_away_goals),
    has_projection: f.has_projection!,
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
  /** Per-component breakdown of expected_fpl_points, straight from fpl_player_projections -- these are pulled, never recomputed, and should sum close to expected_fpl_points. */
  xpts_appearance: number | null;
  xpts_goals: number | null;
  xpts_assists: number | null;
  xpts_clean_sheet: number | null;
  xpts_saves: number | null;
  xpts_defensive_contribution: number | null;
  xpts_cards_own_goals: number | null;
  xpts_bonus: number | null;
  xpts_goals_conceded: number | null;
  xpts_penalties: number | null;
  /** 0-1, how much the minutes/lineup estimate behind this projection can be trusted -- see fixture_player_expected_minutes_resolved_v3.minutes_source for the tiers (squad-state override highest, fallback history lowest). Null where no projection exists at all. */
  lineup_confidence: number | null;
  /** FPL's own "selected by X% of managers" ownership figure, from fpl_players -- same for a player across every fixture row this gameweek. */
  selected_by_percent: number | null;
  /**
   * True when the fixture has already been played -- this projection is
   * the current model recalculating retrospectively, NOT an archived
   * pre-match forecast. The UI must not present it as the latter.
   */
  is_retrospective: boolean;
  /** Real result, from fpl_prediction_actual_start_comparison -- null until the match has been played and backfilled. Independent of every projection field above; can be present with no projection at all (true for all of GW1-4 right now). */
  actual_started: boolean | null;
  actual_minutes: number | null;
  /** Real FPL points scored, from fpl_player_gameweeks -- null until played and backfilled. */
  actual_points: number | null;
};

/**
 * Season-to-date actual vs projected comparison for one player: total
 * points and points-per-game, computed ONLY over gameweeks that have
 * actually been played (so the two sides are on a like-for-like basis --
 * summing a partial season's projections against a full season's actuals
 * would be meaningless). Both totals come straight from stored data
 * (fpl_player_gameweeks.total_points for actual, fpl_player_projections
 * for projected); nothing is recomputed here.
 */
export type SeasonPlayerActualVsProjected = {
  fpl_player_id: number;
  web_name: string;
  games_played: number;
  actual_total_points: number;
  actual_ppg: number;
  /** Sum of expected_fpl_points for the SAME played fixtures only -- null if the model has no projection for any of them. */
  projected_total_points: number | null;
  projected_ppg: number | null;
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
  const { data: projectionsRaw, error } = await query;
  if (error) throw error;

  // fpl_season_player_projection_feed reads fpl_player_projections via
  // plain JOINs onto fixtures and fpl_players. fixture_id and
  // fpl_player_id are NOT NULL in fpl_player_projections, and matchweek
  // is constrained by this query's own .eq() filter -- but team_id is a
  // COALESCE of two NULLABLE fpl_players columns and web_name is
  // nullable there too, so a row can genuinely lack either. Those rows
  // can't be keyed to a team or displayed, so drop them here rather than
  // assert further down.
  type ProjRow = NonNullable<typeof projectionsRaw>[number];
  const projections = (projectionsRaw ?? []).filter(
    (p): p is ProjRow & { fixture_id: number; fpl_player_id: number; matchweek: number; team_id: number; web_name: string } =>
      p.fixture_id !== null &&
      p.fpl_player_id !== null &&
      p.matchweek !== null &&
      p.team_id !== null &&
      p.web_name !== null
  );

  // Actual results are fetched independently of projections -- a fixture
  // can have real backfilled results with no projection at all (true for
  // every GW1-4 fixture right now), and this must not be gated behind a
  // projection existing.
  let actualQuery = supabase.from('fpl_prediction_actual_start_comparison').select('*').eq('matchweek', matchweek);
  if (fixtureId !== undefined) actualQuery = actualQuery.eq('fixture_id', fixtureId);
  const { data: actualRows, error: actualError } = await actualQuery;
  if (actualError) throw actualError;

  // fpl_prediction_actual_start_comparison reads fixture_actual_lineup_players
  // via a plain JOIN, but fpl_player_id, web_name and minutes are all
  // NULLABLE in that base table -- an inner join doesn't rescue a nullable
  // column. None are null today (1,229 rows checked), but a row missing an
  // id or a name can't be keyed or displayed, so drop those rather than
  // assert. starter and team_id are NOT NULL at source.
  type ActualRow = NonNullable<typeof actualRows>[number];
  const usableActuals = (actualRows ?? []).filter(
    (
      r
    ): r is ActualRow & {
      fpl_player_id: number;
      web_name: string;
      actual_minutes: number;
      fixture_id: number;
      matchweek: number;
      team_id: number;
    } =>
      r.fpl_player_id !== null &&
      r.web_name !== null &&
      r.actual_minutes !== null &&
      r.fixture_id !== null &&
      r.matchweek !== null &&
      r.team_id !== null
  );

  const actualByKey = new Map<string, { started: boolean; minutes: number; team_id: number; web_name: string }>();
  for (const r of usableActuals) {
    actualByKey.set(`${r.fixture_id}:${r.fpl_player_id}`, {
      started: r.actual_started!,
      minutes: r.actual_minutes,
      team_id: r.team_id!,
      web_name: r.web_name,
    });
  }

  const fixtureIds = [...new Set([...projections.map((p) => p.fixture_id), ...usableActuals.map((r) => r.fixture_id)])];
  const statusByFixture = new Map<number, string>();
  const kickoffByFixture = new Map<number, string>();
  if (fixtureIds.length > 0) {
    const { data: fixtureRows, error: fixtureError } = await supabase
      .from('fpl_season_fixture_feed')
      .select('fixture_id, status, kickoff_date')
      .in('fixture_id', fixtureIds);
    if (fixtureError) throw fixtureError;
    for (const f of fixtureRows ?? []) {
      // fixture_id, status and kickoff_date are all NOT NULL in fixtures;
      // this view selects them through a plain JOIN, so they're present.
      statusByFixture.set(f.fixture_id!, f.status!);
      kickoffByFixture.set(f.fixture_id!, f.kickoff_date!);
    }
  }

  const playerIds = [...new Set(projections.map((p) => p.fpl_player_id))];
  const xptsByKey = new Map<string, {
    expected_fpl_points: number | null;
    xpts_appearance: number | null;
    xpts_goals: number | null;
    xpts_assists: number | null;
    xpts_clean_sheet: number | null;
    xpts_saves: number | null;
    xpts_defensive_contribution: number | null;
    xpts_cards_own_goals: number | null;
    xpts_bonus: number | null;
    xpts_goals_conceded: number | null;
    xpts_penalties: number | null;
    lineup_confidence: number | null;
  }>();
  if (playerIds.length > 0 && fixtureIds.length > 0) {
    const { data: xptsRows, error: xptsError } = await supabase
      .from('fpl_player_projections')
      .select(
        'fixture_id, fpl_player_id, expected_fpl_points, xpts_appearance, xpts_goals, xpts_assists, xpts_clean_sheet, xpts_saves, xpts_defensive_contribution, xpts_cards_own_goals, xpts_bonus, xpts_goals_conceded, xpts_penalties, lineup_confidence'
      )
      .eq('model_version', SEASON_XPTS_MODEL_VERSION)
      .in('fixture_id', fixtureIds)
      .in('fpl_player_id', playerIds);
    if (xptsError) throw xptsError;
    for (const row of xptsRows ?? []) {
      xptsByKey.set(`${row.fixture_id}:${row.fpl_player_id}`, {
        expected_fpl_points: num(row.expected_fpl_points),
        xpts_appearance: num(row.xpts_appearance),
        xpts_goals: num(row.xpts_goals),
        xpts_assists: num(row.xpts_assists),
        xpts_clean_sheet: num(row.xpts_clean_sheet),
        xpts_saves: num(row.xpts_saves),
        xpts_defensive_contribution: num(row.xpts_defensive_contribution),
        xpts_cards_own_goals: num(row.xpts_cards_own_goals),
        xpts_bonus: num(row.xpts_bonus),
        xpts_goals_conceded: num(row.xpts_goals_conceded),
        xpts_penalties: num(row.xpts_penalties),
        lineup_confidence: num(row.lineup_confidence),
      });
    }
  }

  const selectedByPercentByPlayer = new Map<number, number>();
  if (playerIds.length > 0) {
    const { data: playerRows, error: playerError } = await supabase
      .from('fpl_players')
      .select('fpl_player_id, selected_by_percent')
      .in('fpl_player_id', playerIds);
    if (playerError) throw playerError;
    for (const row of playerRows ?? []) {
      const v = num(row.selected_by_percent);
      if (v !== null) selectedByPercentByPlayer.set(row.fpl_player_id, v);
    }
  }

  const actualPointsByKey = new Map<string, number>();
  if (fixtureIds.length > 0 && playerIds.length > 0) {
    const { data: gwRows, error: gwError } = await supabase
      .from('fpl_player_gameweeks' as any)
      .select('fpl_fixture_id, fpl_player_id, total_points')
      .in('fpl_fixture_id', fixtureIds)
      .in('fpl_player_id', playerIds);
    if (gwError) throw gwError;
    for (const row of (gwRows ?? []) as any[]) {
      if (row.total_points !== null) actualPointsByKey.set(`${row.fpl_fixture_id}:${row.fpl_player_id}`, row.total_points);
    }
  }

  const rows: SeasonPlayerProjection[] = projections.map((p) => {
    const actual = actualByKey.get(`${p.fixture_id}:${p.fpl_player_id}`);
    const xpts = xptsByKey.get(`${p.fixture_id}:${p.fpl_player_id}`);
    return {
      fixture_id: p.fixture_id,
      matchweek: p.matchweek,
      // fixtures.kickoff_date is NOT NULL, reached via a plain JOIN.
      kickoff_date: p.kickoff_date!,
      team_id: p.team_id,
      team_name: teamNames.get(p.team_id) ?? 'Unknown',
      web_name: p.web_name,
      fpl_player_id: p.fpl_player_id,
      // element_type is FPL's own 1-4 GKP/DEF/MID/FWD encoding; the
      // column is a plain int in Postgres so codegen widens it to number.
      fpl_position: asElementType(p.fpl_position),
      fpl_position_label: asElementType(p.fpl_position) ? FPL_POSITION_LABEL[asElementType(p.fpl_position)!] : '\u2014',
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
      expected_fpl_points: xpts?.expected_fpl_points ?? null,
      xpts_appearance: xpts?.xpts_appearance ?? null,
      xpts_goals: xpts?.xpts_goals ?? null,
      xpts_assists: xpts?.xpts_assists ?? null,
      xpts_clean_sheet: xpts?.xpts_clean_sheet ?? null,
      xpts_saves: xpts?.xpts_saves ?? null,
      xpts_defensive_contribution: xpts?.xpts_defensive_contribution ?? null,
      xpts_cards_own_goals: xpts?.xpts_cards_own_goals ?? null,
      xpts_bonus: xpts?.xpts_bonus ?? null,
      xpts_goals_conceded: xpts?.xpts_goals_conceded ?? null,
      xpts_penalties: xpts?.xpts_penalties ?? null,
      lineup_confidence: xpts?.lineup_confidence ?? null,
      selected_by_percent: selectedByPercentByPlayer.get(p.fpl_player_id) ?? null,
      is_retrospective: statusByFixture.get(p.fixture_id) === 'played',
      actual_started: actual?.started ?? null,
      actual_minutes: actual?.minutes ?? null,
      actual_points: actualPointsByKey.get(`${p.fixture_id}:${p.fpl_player_id}`) ?? null,
    };
  });

  // Any player with actual data but no projection at all -- every GW1-4
  // player right now -- gets its own row rather than being dropped. Real
  // tactical role/position aren't available for these (no projection
  // pipeline ran for them), so those fields are null -- never guessed.
  const projectedKeys = new Set(projections.map((p) => `${p.fixture_id}:${p.fpl_player_id}`));
  for (const r of usableActuals) {
    const key = `${r.fixture_id}:${r.fpl_player_id}`;
    if (projectedKeys.has(key)) continue;
    rows.push({
      fixture_id: r.fixture_id,
      matchweek: r.matchweek,
      kickoff_date: kickoffByFixture.get(r.fixture_id) ?? r.kickoff_date!,
      team_id: r.team_id,
      team_name: teamNames.get(r.team_id) ?? 'Unknown',
      web_name: r.web_name,
      fpl_player_id: r.fpl_player_id,
      fpl_position: null,
      fpl_position_label: '\u2014',
      tactical_role: null,
      expected_minutes: null,
      start_probability: null,
      sub_appearance_probability: null,
      shrunk_xg90: null,
      shrunk_xa90: null,
      expected_goals: null,
      expected_assists: null,
      clean_sheet_probability: null,
      defensive_contribution_probability: null,
      experimental_expected_bonus: null,
      expected_fpl_points: null,
      xpts_appearance: null,
      xpts_goals: null,
      xpts_assists: null,
      xpts_clean_sheet: null,
      xpts_saves: null,
      xpts_defensive_contribution: null,
      xpts_cards_own_goals: null,
      xpts_bonus: null,
      xpts_goals_conceded: null,
      xpts_penalties: null,
      lineup_confidence: null,
      selected_by_percent: selectedByPercentByPlayer.get(r.fpl_player_id) ?? null,
      is_retrospective: statusByFixture.get(r.fixture_id) === 'played',
      actual_started: r.actual_started,
      actual_minutes: r.actual_minutes,
      actual_points: actualPointsByKey.get(key) ?? null,
    });
  }

  return rows;
}

/**
 * Season-to-date actual vs projected totals/PPG for every player who has
 * played at least one game this season, restricted to league fixtures
 * (fpl_fixture_id -> fixtures.league_id = leagueId) so a player who's also
 * played cup football doesn't have those games silently folded in.
 * Projected total/PPG is computed only over the SAME played fixtures a
 * player has an actual result for -- never padded with unplayed weeks.
 */
export async function getSeasonActualVsProjected(leagueId: number, seasonId: number): Promise<SeasonPlayerActualVsProjected[]> {
  const { data: fixtureRows, error: fixtureError } = await supabase
    .from('fixtures')
    .select('fixture_id')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .eq('status', 'played');
  if (fixtureError) throw fixtureError;
  const playedFixtureIds = (fixtureRows ?? []).map((f) => f.fixture_id);
  if (playedFixtureIds.length === 0) return [];

  const { data: gwRows, error: gwError } = await supabase
    .from('fpl_player_gameweeks' as any)
    .select('fpl_player_id, fpl_fixture_id, total_points')
    .in('fpl_fixture_id', playedFixtureIds);
  if (gwError) throw gwError;

  const byPlayer = new Map<number, { games: number; points: number; fixtureIds: number[] }>();
  for (const row of (gwRows ?? []) as any[]) {
    if (row.total_points === null) continue;
    const entry = byPlayer.get(row.fpl_player_id) ?? { games: 0, points: 0, fixtureIds: [] };
    entry.games += 1;
    entry.points += row.total_points;
    entry.fixtureIds.push(row.fpl_fixture_id);
    byPlayer.set(row.fpl_player_id, entry);
  }

  const playerIds = [...byPlayer.keys()];
  if (playerIds.length === 0) return [];

  const { data: projRows, error: projError } = await supabase
    .from('fpl_player_projections')
    .select('fpl_player_id, fixture_id, expected_fpl_points')
    .eq('model_version', SEASON_XPTS_MODEL_VERSION)
    .in('fpl_player_id', playerIds)
    .in('fixture_id', playedFixtureIds);
  if (projError) throw projError;
  const projByKey = new Map<string, number>();
  for (const row of projRows ?? []) {
    const v = num(row.expected_fpl_points);
    if (v !== null) projByKey.set(`${row.fpl_player_id}:${row.fixture_id}`, v);
  }

  const { data: nameRows, error: nameError } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name')
    .in('fpl_player_id', playerIds);
  if (nameError) throw nameError;
  const nameByPlayer = new Map<number, string>();
  for (const row of nameRows ?? []) nameByPlayer.set(row.fpl_player_id, row.web_name ?? 'Unknown');

  const out: SeasonPlayerActualVsProjected[] = [];
  for (const [playerId, entry] of byPlayer) {
    let projectedTotal = 0;
    let projectedCount = 0;
    for (const fid of entry.fixtureIds) {
      const v = projByKey.get(`${playerId}:${fid}`);
      if (v !== undefined) {
        projectedTotal += v;
        projectedCount += 1;
      }
    }
    out.push({
      fpl_player_id: playerId,
      web_name: nameByPlayer.get(playerId) ?? 'Unknown',
      games_played: entry.games,
      actual_total_points: entry.points,
      actual_ppg: entry.games > 0 ? entry.points / entry.games : 0,
      projected_total_points: projectedCount > 0 ? projectedTotal : null,
      projected_ppg: projectedCount > 0 ? projectedTotal / projectedCount : null,
    });
  }
  return out.sort((a, b) => b.actual_total_points - a.actual_total_points);
}

