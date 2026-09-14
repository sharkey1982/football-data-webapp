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
import type {
  FplElementType,
  FplPlayer,
  FplPlayerProjection,
  FplPredictionActualStartComparison,
  SetPieceHierarchyRow,
  PlayerSquadHierarchyRow,
} from '../types/database';

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

/**
 * Season-to-date points-per-game and average minutes per start for a
 * player, both computed straight from their FPL bootstrap data --
 * points_per_game is FPL's own published stat (not recomputed here), and
 * avg minutes per start is this season's minutes / starts, a sensible
 * "how long do they typically last once actually in the XI" figure.
 * source_payload is the raw bootstrap-static element JSON; both fields
 * come back as strings there (PostgREST jsonb ->> operator), same as the
 * numeric-string columns num() already handles.
 */
function seasonContextStats(player: { minutes: number | null; source_payload: Record<string, unknown> | null }): {
  points_per_game: number | null;
  avg_minutes_per_start: number | null;
} {
  const payload = player.source_payload;
  const pointsPerGame = payload ? num(payload['points_per_game'] as string | number | null) : null;
  const starts = payload ? num(payload['starts'] as string | number | null) : null;
  const avgMinutesPerStart = starts !== null && starts > 0 && player.minutes !== null ? player.minutes / starts : null;
  return { points_per_game: pointsPerGame, avg_minutes_per_start: avgMinutesPerStart };
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

/** A set-piece responsibility. rank 1 = primary taker; higher numbers are further down the pecking order. corner_left/corner_right are merged into 'corner' (best rank of the two), since which side is rarely worth distinguishing at a glance. */
export type SetPieceRole = {
  type: 'penalty' | 'direct_free_kick' | 'indirect_free_kick' | 'corner';
  rank: number;
};

export const SET_PIECE_LABEL: Record<SetPieceRole['type'], string> = {
  penalty: 'Penalties',
  direct_free_kick: 'Direct free-kicks',
  indirect_free_kick: 'Indirect free-kicks',
  corner: 'Corners',
};

/** Short code per set-piece type, e.g. 'P' + rank -> 'P1' -- kept distinct per type deliberately (never merged into one generic "set piece" badge) so a penalty taker and a corner taker read differently at a glance. */
export const SET_PIECE_ABBREV: Record<SetPieceRole['type'], string> = {
  penalty: 'P',
  direct_free_kick: 'FK',
  indirect_free_kick: 'IFK',
  corner: 'C',
};

function ordinalRank(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/** Compact codes for display (e.g. "P1 C1 FK2"), and the full description for a tooltip. */
export function formatSetPieceRoles(roles: SetPieceRole[]): { compact: string; full: string } | null {
  if (roles.length === 0) return null;
  return {
    compact: roles.map((r) => `${SET_PIECE_ABBREV[r.type]}${r.rank}`).join(' '),
    full: roles.map((r) => `${SET_PIECE_LABEL[r.type]} (${ordinalRank(r.rank)})`).join(', '),
  };
}

export type SquadStatus = 'first_choice' | 'rotation' | 'backup' | 'unknown';

/**
 * How advanced a REAL tactical role is, on the same 0-50 scale
 * FormationPitch uses for pitch layout (GK=0 ... CF=50) -- kept here too
 * (duplicated deliberately, see note below) so the position-signal
 * comparison reads the pitch the same way the pitch itself is drawn.
 */
function roleAdvancementScale(role: string): number | null {
  const r = role.toUpperCase();
  if (r === 'GK') return 0;
  if (['CB', 'LCB', 'RCB'].includes(r)) return 10;
  if (r === 'LB' || r === 'RB') return 12;
  if (r === 'LWB' || r === 'RWB') return 16;
  if (r === 'DM' || r === 'CDM') return 20;
  if (['CM', 'LM', 'RM'].includes(r)) return 30;
  if (r === 'AM') return 40;
  if (r === 'LW' || r === 'RW') return 44;
  if (r === 'LF' || r === 'RF') return 48;
  if (r === 'CF' || r === 'ST') return 50;
  return null;
}

/**
 * The "normal" advancement range for each FPL scoring position, on the
 * same 0-50 scale. Deliberately wide, especially for MID: FPL's MID
 * bucket genuinely spans everything from a defensive midfielder (20) to
 * an out-and-out winger (44) -- those are NOT "playing advanced for a
 * MID", they're just... a MID. The bands only flag a real, fairly clear
 * mismatch between real role and FPL position, not every role that isn't
 * dead centre of the position's typical spot. Wingers are included in
 * MID's band (not FWD's) because FPL itself classifies most wingers as
 * MID -- a MID playing wide should not be flagged "advanced" just for
 * being a winger, which was the previous version's main false positive.
 */
const POSITION_BAND: Record<2 | 3 | 4, { min: number; max: number }> = {
  2: { min: 0, max: 18 }, // DEF: CB/FB/WB
  3: { min: 18, max: 46 }, // MID: DM through AM and wingers
  4: { min: 38, max: 52 }, // FWD: overlaps AM downward -- a forward playing AM/a withdrawn role is still a normal forward role, not "deeper"
};

/**
 * Compares a player's real tactical role to their FPL scoring position.
 * 'advanced' = playing clearly further forward than their FPL position's
 * normal band (generally a positive signal for attacking returns -- e.g.
 * a defender pushed into central midfield or beyond). 'deeper' = playing
 * clearly further back than normal for their position (generally
 * negative -- e.g. a midfielder shifted into a centre-back role). null
 * when the role falls within the normal band for their position, or when
 * there isn't enough information to compare (no real tactical role yet,
 * an unrecognised role string, or goalkeeper).
 */
function computePositionSignal(fplPosition: FplElementType | null, tacticalRole: string | null): 'advanced' | 'deeper' | null {
  if (!fplPosition || fplPosition === 1 || !tacticalRole) return null;
  const advancement = roleAdvancementScale(tacticalRole);
  if (advancement === null) return null;
  const band = POSITION_BAND[fplPosition];
  if (advancement > band.max) return 'advanced';
  if (advancement < band.min) return 'deeper';
  return null;
}

export type FplFixtureProjectionPlayer = {
  fpl_player_id: number;
  web_name: string;
  fpl_position: FplElementType | null;
  fpl_position_label: string;
  /** Real tactical role from the tactical model (e.g. RWB, CF, AM) -- distinct from fpl_position. */
  tactical_role: string | null;
  tactical_role_sources: number | null;
  /** How the real tactical role compares to the player's nominal FPL position -- see computePositionSignal. */
  position_signal: 'advanced' | 'deeper' | null;
  /** Set-piece responsibilities for this player's team, regardless of whether this specific player takes any. Empty array = not among the ranked takers for anything. */
  set_piece_roles: SetPieceRole[];
  /** Squad pecking order classification. Null when this player hasn't been classified (not itself meaningful -- just not yet covered). */
  squad_status: SquadStatus | null;
  /** Share of expected_fpl_points coming specifically from penalty conversion (xpts.penalties / expected_fpl_points). This is the one component of the points total the model isolates cleanly -- corner/free-kick-derived goals and assists are blended into xpts.goals/xpts.assists and can't be split out without the model inventing a number, so this is deliberately just the penalty share, not a general "set-piece points" share. Null when expected_fpl_points isn't positive. */
  penalty_points_share: number | null;
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
  /** Season-to-date points per game played (FPL's own stat, from source_payload -- not recomputed). Context for the projection below, not part of it. */
  season_points_per_game: number | null;
  /** Season-to-date minutes / starts -- how long they typically last once actually in the XI. Null if they haven't started at all yet. */
  season_avg_minutes_per_start: number | null;
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

  const homeTeamId = (fixture as any).home_team_id;
  const awayTeamId = (fixture as any).away_team_id;

  const [{ data: teamTactics, error: teamTacticsError }, { data: projections, error: projectionsError }, { data: setPieceRows, error: setPieceError }, { data: squadRows, error: squadError }] =
    await Promise.all([
      supabase.from('fixture_team_tactical_consensus').select('*').eq('fixture_id', fixtureId),
      supabase.from('fpl_player_projections').select('*').eq('fixture_id', fixtureId).eq('model_version', CURRENT_MODEL_VERSION),
      supabase.from('set_piece_hierarchies').select('*').in('team_id', [homeTeamId, awayTeamId]),
      supabase.from('player_squad_hierarchy').select('*').in('team_id', [homeTeamId, awayTeamId]),
    ]);
  if (teamTacticsError) throw teamTacticsError;
  if (projectionsError) throw projectionsError;
  if (setPieceError) throw setPieceError;
  if (squadError) throw squadError;

  const setPieceRolesByPlayer = new Map<number, SetPieceRole[]>();
  for (const row of (setPieceRows ?? []) as SetPieceHierarchyRow[]) {
    if (!row) continue;
    const playerId = Number(row.source_player_id);
    if (!Number.isFinite(playerId)) continue;
    const type: SetPieceRole['type'] = row.set_piece_type === 'corner_left' || row.set_piece_type === 'corner_right' ? 'corner' : row.set_piece_type;
    const existing = setPieceRolesByPlayer.get(playerId) ?? [];
    const already = existing.find((r) => r.type === type);
    if (already) {
      already.rank = Math.min(already.rank, row.rank); // corner_left/corner_right merge into one entry at the better rank
    } else {
      existing.push({ type, rank: row.rank });
    }
    setPieceRolesByPlayer.set(playerId, existing);
  }

  const squadStatusByPlayer = new Map<number, SquadStatus>();
  for (const row of (squadRows ?? []) as PlayerSquadHierarchyRow[]) {
    squadStatusByPlayer.set(row.fpl_player_id, row.squad_status);
  }

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
    const penaltyPoints = num(proj.xpts_penalties);
    const penaltyPointsShare =
      expectedFplPoints !== null && expectedFplPoints > 0 && penaltyPoints !== null ? penaltyPoints / expectedFplPoints : null;
    const seasonStats = seasonContextStats(player);

    return {
      fpl_player_id: proj.fpl_player_id,
      web_name: player.web_name ?? `Player ${proj.fpl_player_id}`,
      fpl_position: player.element_type,
      fpl_position_label: player.element_type ? FPL_POSITION_LABEL[player.element_type] : '—',
      tactical_role: role?.tactical_role ?? null,
      tactical_role_sources: role?.sources ?? null,
      position_signal: computePositionSignal(player.element_type, role?.tactical_role ?? null),
      set_piece_roles: (setPieceRolesByPlayer.get(proj.fpl_player_id) ?? []).sort((a, b) => a.rank - b.rank),
      squad_status: squadStatusByPlayer.get(proj.fpl_player_id) ?? null,
      penalty_points_share: penaltyPointsShare,
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
      season_points_per_game: seasonStats.points_per_game,
      season_avg_minutes_per_start: seasonStats.avg_minutes_per_start,
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

// ============================================================================
// Actual vs predicted starts -- completed-fixture comparison
//
// Separate from the projection types above on purpose: this reads
// fpl_prediction_actual_start_comparison, which is a simpler, dedicated
// feed for "what actually happened" (real starts/minutes from the match)
// next to whatever prediction exists for the same player -- not the full
// xpts/tactical-role projection breakdown. Real formations/tactical roles
// are not populated on the actual side yet, so this deliberately has no
// formation field and nothing here should be rendered as pitch positions.
// ============================================================================

export type FplActualVsPredictedPlayer = {
  fpl_player_id: number;
  player_name: string;
  web_name: string;
  actual_started: boolean;
  actual_minutes: number;
  predicted_start_probability: number | null;
  predicted_minutes: number | null;
  /**
   * True only for a prediction genuinely generated before this match
   * kicked off -- the only case that may ever be called a real forecast.
   * False/null means the prediction (if any) was generated after the fact
   * and must be labelled as a retrospective projection, never a forecast.
   */
  generated_pre_kickoff: boolean | null;
};

export type FplActualVsPredictedTeam = {
  team_id: number;
  team_name: string;
  players: FplActualVsPredictedPlayer[];
};

export type FplActualVsPredictedFixture = {
  fixture_id: number;
  matchweek: number;
  kickoff_date: string;
  kickoff_time: string | null;
  home_team_id: number;
  away_team_id: number;
  home: FplActualVsPredictedTeam;
  away: FplActualVsPredictedTeam;
};

/**
 * Actual (and, where genuinely available, predicted) starts/minutes for
 * one fixture, split by team. Returns null if the fixture has no actual
 * data at all yet (e.g. it hasn't been played, or hasn't been backfilled)
 * -- that's a normal state for most fixtures, not an error.
 */
export async function getFplActualVsPredicted(fixtureId: number): Promise<FplActualVsPredictedFixture | null> {
  const { data, error } = await supabase
    .from('fpl_prediction_actual_start_comparison')
    .select('*')
    .eq('fixture_id', fixtureId);
  if (error) throw error;
  const rows = (data ?? []) as FplPredictionActualStartComparison[];
  if (rows.length === 0) return null;

  const first = rows[0];
  const teamIds = [...new Set(rows.map((r) => r.team_id))];
  // The view has no home/away flag or team name -- both come from fixtures/teams.
  const { data: fixture, error: fixtureError } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, matchweek, kickoff_date, kickoff_time, home_team_id, away_team_id,
      home_team:teams!fixtures_home_team_id_fkey(team_id, canonical_name),
      away_team:teams!fixtures_away_team_id_fkey(team_id, canonical_name)
    `
    )
    .eq('fixture_id', fixtureId)
    .maybeSingle();
  if (fixtureError) throw fixtureError;

  const f = fixture as any;
  const homeTeamId: number = f?.home_team_id ?? teamIds[0];
  const awayTeamId: number = f?.away_team_id ?? teamIds.find((id) => id !== homeTeamId) ?? teamIds[1];
  const teamNameById = new Map<number, string>();
  if (f?.home_team) teamNameById.set(homeTeamId, f.home_team.canonical_name);
  if (f?.away_team) teamNameById.set(awayTeamId, f.away_team.canonical_name);

  const buildTeam = (teamId: number): FplActualVsPredictedTeam => ({
    team_id: teamId,
    team_name: teamNameById.get(teamId) ?? 'Unknown',
    players: rows
      .filter((r) => r.team_id === teamId)
      .map((r) => ({
        fpl_player_id: r.fpl_player_id,
        player_name: r.player_name_source,
        web_name: r.web_name,
        actual_started: r.actual_started,
        actual_minutes: r.actual_minutes,
        predicted_start_probability: r.predicted_start_probability,
        predicted_minutes: r.predicted_minutes,
        generated_pre_kickoff: r.generated_pre_kickoff,
      }))
      // Starters first (actual, not predicted -- this is the real result), then by minutes.
      .sort((a, b) => Number(b.actual_started) - Number(a.actual_started) || b.actual_minutes - a.actual_minutes),
  });

  return {
    fixture_id: fixtureId,
    matchweek: f?.matchweek ?? first.matchweek,
    kickoff_date: f?.kickoff_date ?? first.kickoff_date,
    kickoff_time: f?.kickoff_time ?? first.kickoff_time,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home: buildTeam(homeTeamId),
    away: buildTeam(awayTeamId),
  };
}
