// ============================================================================
// src/lib/fplApi.ts
//
// Data-access layer for the FPL Projections section. Kept separate from
// src/lib/api.ts (which is already large and covers the results/ratings
// side of the app) so the two model domains -- historical Dixon-Coles
// results vs. forward-looking FPL projections -- stay easy to navigate
// independently. Follows the same query style as api.ts (supabase-js calls
// returning typed rows, thrown on error).
//
// IMPORTANT MODEL RULES (see also the project brief):
//   - Dixon-Coles team xG (fixtures.predicted_home_goals/away_goals) drives
//     the team-level scoring expectation. This is NOT recomputed here.
//   - Real tactical role (fixture_player_tactical_consensus.tactical_role)
//     is a distinct concept from FPL scoring position
//     (fpl_players.element_type) -- never conflate the two.
//   - This module only reads model OUTPUTS. It does not implement any part
//     of the projection pipeline itself.
// ============================================================================

import { supabase } from './supabase';
import type { FplElementType, FplPlayer, FplPlayerProjection } from '../types/database';

/** The model_version currently surfaced by the frontend. */
/**
 * The model_version currently surfaced by the frontend as "the" production
 * projection -- single source of truth, reused by fplSeasonApi.ts too, so
 * the single-fixture screen and the season browser can never disagree
 * about which model's numbers are "current". Prior values ('prototype_v2',
 * 'prototype_v3', 'trial_v1') only ever covered fixture 36 and are
 * superseded by leaguewide_v4, which as of writing covers fixture 36 plus
 * all of gameweek 5 -- most fixtures still have no projection under any
 * model version yet, which the UI (both screens) treats as a normal
 * "not modelled yet" state, not an error.
 */
export const CURRENT_MODEL_VERSION = 'leaguewide_v4';

export const FPL_POSITION_LABEL: Record<FplElementType, string> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

/**
 * Parses a PostgREST numeric-as-string field. These columns are declared as
 * unscaled `numeric` in Postgres (rather than double precision), so
 * PostgREST returns them as JSON strings to avoid silent precision loss --
 * some come back as very long exact-decimal strings. Number() handles that
 * fine for display purposes; callers round further as needed.
 */
export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type FplXptsBreakdown = {
  appearance: number | null;
  goals: number | null;
  assists: number | null;
  clean_sheet: number | null;
  saves: number | null;
  defensive_contribution: number | null;
  goals_conceded: number | null;
  cards_own_goals: number | null;
  penalties: number | null;
  bonus: number | null;
};

export type FplFixtureProjectionPlayer = {
  fpl_player_id: number;
  web_name: string;
  fpl_position: FplElementType | null;
  fpl_position_label: string;
  /** Real tactical role from the tactical model (e.g. RWB, CF, AM) -- distinct from fpl_position. */
  tactical_role: string | null;
  tactical_role_sources: number | null;
  expected_minutes: number | null;
  expected_goals: number | null;
  expected_assists: number | null;
  expected_fpl_points: number | null;
  /** Current FPL price in £m (fpl_players.now_cost is tenths of a million, e.g. 50 -> 5.0). */
  price: number | null;
  /** Projected value: expected_fpl_points per £m of price. Null if price is missing/zero. */
  value: number | null;
  start_probability: number | null;
  sub_appearance_probability: number | null;
  availability_probability: number | null;
  lineup_confidence: number | null;
  clean_sheet_probability: number | null;
  expected_saves: number | null;
  expected_bonus: number | null;
  defensive_contribution_probability: number | null;
  xpts: FplXptsBreakdown;
  /** Official FPL availability status code (e.g. 'a' = available, 'i' = injured, 'd' = doubtful). */
  status: string | null;
  news: string | null;
};

export type FplFixtureProjectionTeam = {
  team_id: number;
  team_name: string;
  is_home: boolean;
  formation: string | null;
  formation_source_count: number | null;
  team_expected_goals: number | null;
  clean_sheet_probability: number | null;
  players: FplFixtureProjectionPlayer[];
};

export type FplFixtureProjection = {
  fixture_id: number;
  kickoff_date: string;
  kickoff_time: string | null;
  status: string;
  model_version: string;
  home: FplFixtureProjectionTeam;
  away: FplFixtureProjectionTeam;
};

/**
 * A fixture that has at least one FPL player projection -- used to populate
 * the fixture picker at /fpl. Deliberately generic (any fixture_id with
 * projections), not hard-coded to Leeds vs Newcastle.
 */
export type FplProjectedFixtureSummary = {
  fixture_id: number;
  kickoff_date: string;
  kickoff_time: string | null;
  home_team_id: number;
  home_team_name: string;
  away_team_id: number;
  away_team_name: string;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
};

/** Every fixture_id that currently has a prototype_v3 projection, most recent kickoff first. */
export async function getFplProjectedFixtures(): Promise<FplProjectedFixtureSummary[]> {
  const { data: projectionRows, error: projectionError } = await supabase
    .from('fpl_player_projections')
    .select('fixture_id')
    .eq('model_version', CURRENT_MODEL_VERSION);
  if (projectionError) throw projectionError;

  const fixtureIds = [...new Set((projectionRows ?? []).map((r) => r.fixture_id))];
  if (fixtureIds.length === 0) return [];

  const { data, error } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, kickoff_date, kickoff_time,
      home_team_id, away_team_id, predicted_home_goals, predicted_away_goals,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name)
    `
    )
    .in('fixture_id', fixtureIds)
    .order('kickoff_date', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    fixture_id: row.fixture_id,
    kickoff_date: row.kickoff_date,
    kickoff_time: row.kickoff_time,
    home_team_id: row.home_team_id,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_id: row.away_team_id,
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    predicted_home_goals: row.predicted_home_goals,
    predicted_away_goals: row.predicted_away_goals,
  }));
}

/**
 * The full fixture-projection payload for one fixture: header (kickoff,
 * Dixon-Coles xG), both teams' predicted formation, and every projected
 * player with their real tactical role, FPL position, and projection
 * numbers. Works for any fixture_id that has prototype_v3 projections --
 * not specific to any one match.
 */
export async function getFplFixtureProjection(fixtureId: number): Promise<FplFixtureProjection | null> {
  const { data: fixture, error: fixtureError } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, kickoff_date, kickoff_time, status,
      home_team_id, away_team_id, predicted_home_goals, predicted_away_goals,
      home_team:teams!fixtures_home_team_id_fkey(team_id, canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(team_id, canonical_name)
    `
    )
    .eq('fixture_id', fixtureId)
    .maybeSingle();
  if (fixtureError) throw fixtureError;
  if (!fixture) return null;

  const [{ data: teamTactics, error: teamTacticsError }, { data: projections, error: projectionsError }] =
    await Promise.all([
      supabase.from('fixture_team_tactical_consensus').select('*').eq('fixture_id', fixtureId),
      supabase.from('fpl_player_projections').select('*').eq('fixture_id', fixtureId).eq('model_version', CURRENT_MODEL_VERSION),
    ]);
  if (teamTacticsError) throw teamTacticsError;
  if (projectionsError) throw projectionsError;

  const playerIds = [...new Set((projections ?? []).map((p) => p.fpl_player_id))];

  const { data: playerTactics, error: playerTacticsError } = await supabase
    .from('fixture_player_tactical_consensus')
    .select('*')
    .eq('fixture_id', fixtureId);
  if (playerTacticsError) throw playerTacticsError;

  let players: FplPlayer[] = [];
  if (playerIds.length > 0) {
    const { data, error } = await supabase.from('fpl_players').select('*').in('fpl_player_id', playerIds);
    if (error) throw error;
    players = data ?? [];
  }

  const playerById = new Map((players ?? []).map((p) => [p.fpl_player_id, p]));
  const tacticalRoleByPlayer = new Map((playerTactics ?? []).map((t) => [t.fpl_player_id, t]));
  const formationByTeam = new Map((teamTactics ?? []).map((t) => [t.team_id, t]));

  const buildPlayer = (proj: FplPlayerProjection): FplFixtureProjectionPlayer | null => {
    const player = playerById.get(proj.fpl_player_id);
    if (!player) return null;
    const role = tacticalRoleByPlayer.get(proj.fpl_player_id);
    const price = player.now_cost !== null ? player.now_cost / 10 : null;
    const expectedFplPoints = num(proj.expected_fpl_points);
    const value = price !== null && price > 0 && expectedFplPoints !== null ? expectedFplPoints / price : null;

    return {
      fpl_player_id: proj.fpl_player_id,
      web_name: player.web_name ?? `Player ${proj.fpl_player_id}`,
      fpl_position: player.element_type,
      fpl_position_label: player.element_type ? FPL_POSITION_LABEL[player.element_type] : '—',
      tactical_role: role?.tactical_role ?? null,
      tactical_role_sources: role?.sources ?? null,
      expected_minutes: num(proj.expected_minutes),
      expected_goals: num(proj.expected_goals),
      expected_assists: num(proj.expected_assists),
      expected_fpl_points: expectedFplPoints,
      price,
      value,
      start_probability: num(proj.start_probability),
      sub_appearance_probability: num(proj.sub_appearance_probability),
      availability_probability: num(proj.availability_probability),
      lineup_confidence: num(proj.lineup_confidence),
      clean_sheet_probability: num(proj.clean_sheet_probability),
      expected_saves: num(proj.expected_saves),
      expected_bonus: num(proj.expected_bonus),
      defensive_contribution_probability: num(proj.defensive_contribution_probability),
      xpts: {
        appearance: num(proj.xpts_appearance),
        goals: num(proj.xpts_goals),
        assists: num(proj.xpts_assists),
        clean_sheet: num(proj.xpts_clean_sheet),
        saves: num(proj.xpts_saves),
        defensive_contribution: num(proj.xpts_defensive_contribution),
        goals_conceded: num(proj.xpts_goals_conceded),
        cards_own_goals: num(proj.xpts_cards_own_goals),
        penalties: num(proj.xpts_penalties),
        bonus: num(proj.xpts_bonus),
      },
      status: player.status,
      news: player.news,
    };
  };

  const byTeam = new Map<number, FplFixtureProjectionPlayer[]>();
  let modelVersion = CURRENT_MODEL_VERSION;
  for (const proj of projections ?? []) {
    modelVersion = proj.model_version;
    const player = playerById.get(proj.fpl_player_id);
    if (!player || player.canonical_team_id == null) continue;
    const built = buildPlayer(proj);
    if (!built) continue;
    const list = byTeam.get(player.canonical_team_id) ?? [];
    list.push(built);
    byTeam.set(player.canonical_team_id, list);
  }

  // Default order: projected starters / highest expected minutes first,
  // then likely substitutes -- "football sense" ordering per the brief.
  const sortPlayers = (list: FplFixtureProjectionPlayer[]) =>
    [...list].sort((a, b) => (b.expected_minutes ?? -1) - (a.expected_minutes ?? -1));

  const teamCleanSheetProbability = (list: FplFixtureProjectionPlayer[]): number | null => {
    const values = list.map((p) => p.clean_sheet_probability).filter((v): v is number => v !== null);
    return values.length > 0 ? Math.max(...values) : null;
  };

  const buildTeam = (
    teamId: number,
    teamName: string,
    isHome: boolean,
    teamExpectedGoals: number | null
  ): FplFixtureProjectionTeam => {
    const tactics = formationByTeam.get(teamId);
    const teamPlayers = sortPlayers(byTeam.get(teamId) ?? []);
    return {
      team_id: teamId,
      team_name: teamName,
      is_home: isHome,
      formation: tactics?.formation ?? null,
      formation_source_count: tactics?.sources ?? null,
      team_expected_goals: teamExpectedGoals,
      clean_sheet_probability: teamCleanSheetProbability(teamPlayers),
      players: teamPlayers,
    };
  };

  const f = fixture as any;

  return {
    fixture_id: f.fixture_id,
    kickoff_date: f.kickoff_date,
    kickoff_time: f.kickoff_time,
    status: f.status,
    model_version: modelVersion,
    home: buildTeam(f.home_team_id, f.home_team?.canonical_name ?? 'Unknown', true, num(f.predicted_home_goals)),
    away: buildTeam(f.away_team_id, f.away_team?.canonical_name ?? 'Unknown', false, num(f.predicted_away_goals)),
  };
}
