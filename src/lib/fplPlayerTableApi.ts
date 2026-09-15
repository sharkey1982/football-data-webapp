// ============================================================================
// src/lib/fplPlayerTableApi.ts
//
// Data layer for the standalone Player Projections table page (Fantasy menu):
// one row per player, viewable either as points-per-gameweek across a range,
// or as a points-by-contribution breakdown summed across that range.
//
// DELIBERATE DEPARTURE from fplSeasonApi.ts's convention of reading only the
// frontend-facing season feed views: fpl_season_player_projection_feed (which
// those views ultimately chain into) times out for any matchweek query --
// traced to window functions inside two of its dependencies that Postgres
// can't push a matchweek filter through, so it materializes the full season
// before filtering (confirmed live, GW4: statement timeout; see handoff notes
// from 2026-09-15). fpl_player_projections is a genuine TABLE with real
// indexes, not a view chain -- querying it directly for a GW range measured
// at ~9ms once fixtures are filtered first via a CTE, vs timing out through
// the view. Same underlying data, same model_version, just without the
// window-function bottleneck in the way.
// ============================================================================

import { supabase } from './supabase';
import { num, FPL_POSITION_LABEL, CURRENT_MODEL_VERSION } from './fplApi';
import type { FplElementType } from '../types/database';

export const PLAYER_TABLE_MODEL_VERSION = CURRENT_MODEL_VERSION;

/** One player's projected or actual points for one gameweek. Never both null -- a row only exists where at least one side has data. */
export type PlayerGameweekPoints = {
  fpl_player_id: number;
  web_name: string;
  team_id: number;
  team_name: string;
  fpl_position: FplElementType | null;
  fpl_position_label: string;
  matchweek: number;
  /** Real FPL points scored -- null until the fixture's played and backfilled. */
  actual_points: number | null;
  /** Model's expected_fpl_points for this fixture -- null where the model hasn't covered it (see PLAYER_TABLE_MODEL_VERSION). */
  projected_points: number | null;
  /** Per-component breakdown of projected_points -- null wherever projected_points itself is null. Never populated for actual_points (would require reimplementing FPL's full scoring ruleset from raw stats; the model's own breakdown is the trustworthy source). */
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
};

/**
 * Every player's actual and/or projected points for each gameweek in
 * [fromMatchweek, toMatchweek], league-wide (E0 only, matching every other
 * FPL screen in this app). One row per player per gameweek that has actual
 * data, projected data, or both.
 */
export async function getPlayerGameweekPointsRange(fromMatchweek: number, toMatchweek: number): Promise<PlayerGameweekPoints[]> {
  const { data: fixtureRows, error: fixtureError } = await supabase
    .from('fixtures')
    .select('fixture_id, matchweek')
    .eq('league_id', 1)
    .eq('season_id', 13)
    .gte('matchweek', fromMatchweek)
    .lte('matchweek', toMatchweek);
  if (fixtureError) throw fixtureError;
  const fixtureIds = (fixtureRows ?? []).map((f) => f.fixture_id);
  const matchweekByFixture = new Map<number, number>();
  for (const f of fixtureRows ?? []) if (f.matchweek !== null) matchweekByFixture.set(f.fixture_id, f.matchweek);
  if (fixtureIds.length === 0) return [];

  const { data: projRows, error: projError } = await supabase
    .from('fpl_player_projections')
    .select(
      'fpl_player_id, fixture_id, expected_fpl_points, xpts_appearance, xpts_goals, xpts_assists, xpts_clean_sheet, xpts_saves, xpts_defensive_contribution, xpts_cards_own_goals, xpts_bonus, xpts_goals_conceded, xpts_penalties'
    )
    .eq('model_version', PLAYER_TABLE_MODEL_VERSION)
    .in('fixture_id', fixtureIds);
  if (projError) throw projError;

  const { data: gwRows, error: gwError } = await supabase
    .from('fpl_player_gameweeks' as any)
    .select('fpl_player_id, fpl_fixture_id, total_points')
    .in('fpl_fixture_id', fixtureIds);
  if (gwError) throw gwError;

  const playerIds = new Set<number>();
  for (const r of projRows ?? []) playerIds.add(r.fpl_player_id);
  for (const r of (gwRows ?? []) as any[]) playerIds.add(r.fpl_player_id);
  if (playerIds.size === 0) return [];

  const { data: playerRows, error: playerError } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name, element_type, canonical_team_id')
    .eq('season_id', 13)
    .in('fpl_player_id', [...playerIds]);
  if (playerError) throw playerError;

  const { data: teamRows, error: teamError } = await supabase.from('teams').select('team_id, canonical_name');
  if (teamError) throw teamError;
  const teamNameById = new Map<number, string>();
  for (const t of teamRows ?? []) teamNameById.set(t.team_id, t.canonical_name);

  const playerInfo = new Map<number, { web_name: string; fpl_position: FplElementType | null; team_id: number }>();
  for (const p of playerRows ?? []) {
    playerInfo.set(p.fpl_player_id, { web_name: p.web_name ?? 'Unknown', fpl_position: p.element_type, team_id: p.canonical_team_id ?? 0 });
  }

  // Key rows by player+matchweek (not player+fixture -- a player only ever
  // has one fixture per matchweek in this league, and matchweek is what the
  // UI filters/pivots by).
  const rowByKey = new Map<string, PlayerGameweekPoints>();
  const keyOf = (playerId: number, mw: number) => `${playerId}:${mw}`;

  const emptyRow = (playerId: number, mw: number): PlayerGameweekPoints => {
    const info = playerInfo.get(playerId);
    return {
      fpl_player_id: playerId,
      web_name: info?.web_name ?? 'Unknown',
      team_id: info?.team_id ?? 0,
      team_name: info ? teamNameById.get(info.team_id) ?? 'Unknown' : 'Unknown',
      fpl_position: info?.fpl_position ?? null,
      fpl_position_label: info?.fpl_position ? FPL_POSITION_LABEL[info.fpl_position] : '\u2014',
      matchweek: mw,
      actual_points: null,
      projected_points: null,
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
    };
  };

  for (const p of projRows ?? []) {
    const mw = matchweekByFixture.get(p.fixture_id);
    if (mw === undefined) continue;
    const key = keyOf(p.fpl_player_id, mw);
    const row = rowByKey.get(key) ?? emptyRow(p.fpl_player_id, mw);
    row.projected_points = num(p.expected_fpl_points);
    row.xpts_appearance = num(p.xpts_appearance);
    row.xpts_goals = num(p.xpts_goals);
    row.xpts_assists = num(p.xpts_assists);
    row.xpts_clean_sheet = num(p.xpts_clean_sheet);
    row.xpts_saves = num(p.xpts_saves);
    row.xpts_defensive_contribution = num(p.xpts_defensive_contribution);
    row.xpts_cards_own_goals = num(p.xpts_cards_own_goals);
    row.xpts_bonus = num(p.xpts_bonus);
    row.xpts_goals_conceded = num(p.xpts_goals_conceded);
    row.xpts_penalties = num(p.xpts_penalties);
    rowByKey.set(key, row);
  }

  for (const g of (gwRows ?? []) as any[]) {
    const mw = matchweekByFixture.get(g.fpl_fixture_id);
    if (mw === undefined || g.total_points === null) continue;
    const key = keyOf(g.fpl_player_id, mw);
    const row = rowByKey.get(key) ?? emptyRow(g.fpl_player_id, mw);
    row.actual_points = g.total_points;
    rowByKey.set(key, row);
  }

  return [...rowByKey.values()];
}
