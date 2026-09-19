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
import type { Json } from '../types/database';
import type {
  FplElementType,
  FplPlayer,
  FplPredictionActualStartComparison,
  FplProjectionFrontendFeedV6,
  SetPieceHierarchyRow,
  PlayerSquadHierarchyRow,
} from '../types/database';

/**
 * The model_version currently surfaced by the frontend as "the" production
 * projection -- single source of truth, reused by fplSeasonApi.ts too, so
 * the single-fixture screen and the season browser can never disagree
 * about which model's numbers are "current". leaguewide_v6 is the current
 * production model (confirmed live: Barry/Haaland GW5 values match the
 * reference figures exactly). Prior values ('leaguewide_v4',
 * 'prototype_v2', 'prototype_v3', 'trial_v1') must not be used -- v4 in
 * particular looks superficially valid (it has real rows) but is stale.
 * Core projection numbers and tactical_role now come from
 * fpl_projection_frontend_feed_v6 directly (see getFplFixtureProjection);
 * this constant is still used to filter fpl_player_projections for the
 * detailed xPts breakdown fields (penalty share, per-component xPts),
 * which aren't part of the v6 feed.
 */
export const CURRENT_MODEL_VERSION = 'leaguewide_v6';

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

/** FPL encodes position as 1-4 (GKP/DEF/MID/FWD), but fpl_players.element_type
 * has NO check constraint -- the database could hold any int, and only does
 * hold 1-4 because that's what FPL's API sends. Narrow at the read boundary
 * rather than claiming the guarantee in the table type. */
/** A v6 feed row already confirmed to carry a player id -- see the filter
 * in getFixtureProjection. Named so the guarantee survives into helper
 * signatures instead of being re-proved at each use. */
type ProjectedRow = FplProjectionFrontendFeedV6 & { fpl_player_id: number };

export function asElementType(v: number | null | undefined): FplElementType | null {
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : null;
}

export function seasonContextStats(
  player: { minutes: number | null; source_payload: Json | null },
  gamesInvolved?: number | null
): {
  points_per_game: number | null;
  avg_minutes_per_start: number | null;
} {
  // source_payload is jsonb, so its generated type is Json -- which
  // legitimately includes scalars and arrays, not just objects. Only
  // index it once it's actually been confirmed to be a plain object.
  const payload =
    player.source_payload !== null && typeof player.source_payload === 'object' && !Array.isArray(player.source_payload)
      ? (player.source_payload as Record<string, unknown>)
      : null;
  const pointsPerGame = payload ? num(payload['points_per_game'] as string | number | null) : null;
  // "games involved" (gameweeks with minutes>0, requested separately via
  // getGamesInvolvedCounts) is the correct denominator -- requested
  // directly after minutes/starts was confirmed to show over 90 for
  // players who've also come on as a substitute in addition to their
  // starts, since those sub minutes land in the numerator (season total
  // minutes) without a matching increment to "starts" in the
  // denominator. Falls back to the old starts-based calculation only
  // when a caller hasn't fetched games-involved counts, so nothing
  // breaks for call sites not yet updated.
  const starts = payload ? num(payload['starts'] as string | number | null) : null;
  const denominator = gamesInvolved !== undefined ? gamesInvolved : starts;
  const avgMinutesPerStart = denominator !== null && denominator > 0 && player.minutes !== null ? player.minutes / denominator : null;
  return { points_per_game: pointsPerGame, avg_minutes_per_start: avgMinutesPerStart };
}

/** Count of gameweeks with minutes > 0 per player -- the correct
 * denominator for "average minutes per game involved" (requested
 * directly to replace minutes/starts, which undercounts games played
 * when a player has also come on as a substitute: those minutes inflate
 * the numerator without a matching start). */
export async function getGamesInvolvedCounts(playerIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (playerIds.length === 0) return out;
  const { data, error } = await (supabase as any)
    .from('fpl_player_gameweeks')
    .select('fpl_player_id, minutes')
    .eq('season_id', 13)
    .in('fpl_player_id', playerIds)
    .gt('minutes', 0);
  if (error) throw error;
  for (const row of (data ?? []) as any[]) out.set(row.fpl_player_id, (out.get(row.fpl_player_id) ?? 0) + 1);
  return out;
}

/** Season-to-date points per game, keyed by fpl_player_id -- a simple,
 * direct lookup (no fixture context needed) for enriching bench/squad
 * displays with a reliability signal beyond the raw projection. */
export async function getPlayerSeasonPpg(playerIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  if (playerIds.length === 0) return out;
  const { data, error } = await supabase.from('fpl_players').select('fpl_player_id, minutes, source_payload').in('fpl_player_id', playerIds);
  if (error) throw error;
  for (const row of data ?? []) out.set(row.fpl_player_id, seasonContextStats({ minutes: row.minutes, source_payload: row.source_payload }).points_per_game);
  return out;
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
export function computePositionSignal(fplPosition: FplElementType | null, tacticalRole: string | null): 'advanced' | 'deeper' | null {
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

  const [
    { data: teamTactics, error: teamTacticsError },
    { data: v6Rows, error: v6Error },
    { data: xptsBreakdownRows, error: xptsBreakdownError },
    { data: setPieceRows, error: setPieceError },
    { data: squadRows, error: squadError },
  ] = await Promise.all([
    supabase.from('fixture_team_tactical_consensus').select('*').eq('fixture_id', fixtureId),
    // Primary source: tactical_role lives here now, alongside the core
    // projection numbers -- see CURRENT_MODEL_VERSION's comment for why
    // this replaces fpl_player_projections + fixture_player_tactical_consensus
    // as the source of truth for both.
    supabase.from('fpl_projection_frontend_feed_v6').select('*').eq('fixture_id', fixtureId),
    // Supplementary: the detailed xPts-per-component breakdown and
    // penalty_points_share aren't part of the v6 feed, so those specific
    // fields still come from fpl_player_projections -- filtered to the
    // SAME current model_version, not the old default.
    supabase.from('fpl_player_projections').select('*').eq('fixture_id', fixtureId).eq('model_version', CURRENT_MODEL_VERSION),
    supabase.from('set_piece_hierarchies').select('*').in('team_id', [homeTeamId, awayTeamId]),
    supabase.from('player_squad_hierarchy').select('*').in('team_id', [homeTeamId, awayTeamId]),
  ]);
  if (teamTacticsError) throw teamTacticsError;
  if (v6Error) throw v6Error;
  if (xptsBreakdownError) throw xptsBreakdownError;
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

  // The v6 feed's fpl_player_id is nullable in the generated type (it's a
  // view, so PostgREST can't prove otherwise); 0 of 7,302 rows are null
  // today. A row with no player id can't be joined to fpl_players or keyed,
  // so drop it rather than assert.
  const projections: ProjectedRow[] = ((v6Rows ?? []) as FplProjectionFrontendFeedV6[]).filter(
    (p): p is ProjectedRow => p.fpl_player_id !== null
  );
  const playerIds = [...new Set(projections.map((p) => p.fpl_player_id))];
  const xptsBreakdownByPlayer = new Map((xptsBreakdownRows ?? []).map((r) => [r.fpl_player_id, r]));

  let players: FplPlayer[] = [];
  if (playerIds.length > 0) {
    const { data, error } = await supabase.from('fpl_players').select('*').in('fpl_player_id', playerIds);
    if (error) throw error;
    players = data ?? [];
  }
  const gamesInvolvedByPlayer = await getGamesInvolvedCounts(playerIds);

  const playerById = new Map((players ?? []).map((p) => [p.fpl_player_id, p]));
  const formationByTeam = new Map((teamTactics ?? []).map((t) => [t.team_id, t]));

  const buildPlayer = (proj: ProjectedRow): FplFixtureProjectionPlayer | null => {
    const player = playerById.get(proj.fpl_player_id);
    if (!player) return null;
    const breakdown = xptsBreakdownByPlayer.get(proj.fpl_player_id);
    const price = player.now_cost !== null ? player.now_cost / 10 : null;
    const expectedFplPoints = num(proj.expected_fpl_points);
    const value = price !== null && price > 0 && expectedFplPoints !== null ? expectedFplPoints / price : null;
    const penaltyPoints = breakdown ? num(breakdown.xpts_penalties) : null;
    const penaltyPointsShare =
      expectedFplPoints !== null && expectedFplPoints > 0 && penaltyPoints !== null ? penaltyPoints / expectedFplPoints : null;
    const seasonStats = seasonContextStats(player, gamesInvolvedByPlayer.get(proj.fpl_player_id) ?? null);

    return {
      fpl_player_id: proj.fpl_player_id,
      web_name: player.web_name ?? proj.web_name ?? `Player ${proj.fpl_player_id}`,
      fpl_position: asElementType(player.element_type) ?? asElementType(proj.fpl_position),
      fpl_position_label: asElementType(player.element_type)
        ? FPL_POSITION_LABEL[asElementType(player.element_type)!]
        : '—',
      tactical_role: proj.tactical_role,
      tactical_role_sources: null, // not part of the v6 feed -- the feed itself is already the consensus output
      position_signal: computePositionSignal(asElementType(player.element_type), proj.tactical_role),
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
      availability_probability: breakdown ? num(breakdown.availability_probability) : null,
      lineup_confidence: num(proj.lineup_confidence),
      clean_sheet_probability: num(proj.clean_sheet_probability),
      expected_saves: breakdown ? num(breakdown.expected_saves) : null,
      expected_bonus: num(proj.expected_bonus),
      defensive_contribution_probability: num(proj.defensive_contribution_probability),
      xpts: {
        appearance: breakdown ? num(breakdown.xpts_appearance) : null,
        goals: breakdown ? num(breakdown.xpts_goals) : null,
        assists: breakdown ? num(breakdown.xpts_assists) : null,
        clean_sheet: breakdown ? num(breakdown.xpts_clean_sheet) : null,
        saves: breakdown ? num(breakdown.xpts_saves) : null,
        defensive_contribution: breakdown ? num(breakdown.xpts_defensive_contribution) : null,
        goals_conceded: breakdown ? num(breakdown.xpts_goals_conceded) : null,
        cards_own_goals: breakdown ? num(breakdown.xpts_cards_own_goals) : null,
        penalties: penaltyPoints,
        bonus: breakdown ? num(breakdown.xpts_bonus) : null,
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
    // model_version is nullable in the view's generated type; keep the
    // existing CURRENT_MODEL_VERSION default rather than asserting.
    modelVersion = proj.model_version ?? modelVersion;
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
  // fpl_prediction_actual_start_comparison reads fixture_actual_lineup_players
  // through a plain JOIN, but fpl_player_id, web_name and minutes are all
  // NULLABLE in that base table -- an inner join doesn't rescue a nullable
  // column. 0 of 1,229 rows are null today. A row with no player id can't be
  // keyed, and one with no name or minutes can't be displayed or sorted, so
  // drop those rather than assert. starter, team_id and player_name_source
  // are NOT NULL at source.
  type ActualComparisonRow = FplPredictionActualStartComparison & {
    fpl_player_id: number;
    web_name: string;
    actual_minutes: number;
  };
  const rows = ((data ?? []) as FplPredictionActualStartComparison[]).filter(
    (r): r is ActualComparisonRow =>
      r.fpl_player_id !== null && r.web_name !== null && r.actual_minutes !== null
  );
  if (rows.length === 0) return null;

  const first = rows[0];
  const teamIds = [...new Set(rows.map((r) => r.team_id!))];
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
        // player_name_source, starter and team_id are NOT NULL in
        // fixture_actual_lineup_players; the view exposes them unchanged.
        player_name: r.player_name_source!,
        web_name: r.web_name,
        actual_started: r.actual_started!,
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

/** Per-player enrichment for the Optimal Squad pitch -- brings across the same context the per-fixture Player Projections pitch already shows, purely for display; never used in the optimiser's own decision. */
export type SquadPitchEnrichment = {
  fpl_player_id: number;
  tactical_role: string | null;
  position_signal: 'advanced' | 'deeper' | null;
  start_probability: number | null;
  lineup_confidence: number | null;
  set_piece_roles: SetPieceRole[];
  squad_status: SquadStatus | null;
  season_points_per_game: number | null;
};

/**
 * Fetches the same per-player context FormationPitch already shows on the
 * per-fixture Player Projections pitch (tactical role, set-piece roles,
 * squad pecking order, season PPG, start-probability reliability) but
 * scoped to a specific squad's players for one target gameweek, rather
 * than one fixture's full lineup. Purely additive/presentational -- the
 * optimiser's own squad/formation/captain choice is untouched; this only
 * decorates how it's displayed.
 *
 * Two-step fixture lookup (rather than an embedded join through
 * fpl_projection_frontend_feed_v6, which is a view without PostgREST-visible
 * FK metadata) so this doesn't depend on join syntax that may not resolve
 * against a view: first the small set of that gameweek's fixture_ids, then
 * the projection feed filtered to those fixtures AND this squad's player
 * IDs specifically -- at most ~15 rows back, regardless of how many players
 * are actually contested for the gameweek.
 */
export async function getSquadPitchEnrichment(matchweek: number, playerIds: number[]): Promise<Map<number, SquadPitchEnrichment>> {
  const out = new Map<number, SquadPitchEnrichment>();
  if (playerIds.length === 0) return out;

  const { data: fixtureRows, error: fixtureError } = await supabase
    .from('fixtures')
    .select('fixture_id, home_team_id, away_team_id')
    .eq('league_id', 1)
    .eq('season_id', 13)
    .eq('matchweek', matchweek);
  if (fixtureError) throw fixtureError;
  const fixtureIds = (fixtureRows ?? []).map((f) => f.fixture_id);
  if (fixtureIds.length === 0) return out;
  const teamIds = [...new Set((fixtureRows ?? []).flatMap((f) => [f.home_team_id, f.away_team_id]))];

  const [{ data: v6Rows, error: v6Error }, { data: setPieceRows, error: setPieceError }, { data: squadRows, error: squadError }, { data: playerRows, error: playerError }] =
    await Promise.all([
      supabase.from('fpl_projection_frontend_feed_v6').select('*').in('fixture_id', fixtureIds).in('fpl_player_id', playerIds),
      supabase.from('set_piece_hierarchies').select('*').in('team_id', teamIds).in('source_player_id', playerIds.map(String)),
      supabase.from('player_squad_hierarchy').select('*').in('team_id', teamIds).in('fpl_player_id', playerIds),
      supabase.from('fpl_players').select('fpl_player_id, minutes, source_payload').in('fpl_player_id', playerIds),
    ]);
  if (v6Error) throw v6Error;
  if (setPieceError) throw setPieceError;
  if (squadError) throw squadError;
  if (playerError) throw playerError;

  const setPieceRolesByPlayer = new Map<number, SetPieceRole[]>();
  for (const row of (setPieceRows ?? []) as SetPieceHierarchyRow[]) {
    const playerId = Number(row.source_player_id);
    if (!Number.isFinite(playerId)) continue;
    const type: SetPieceRole['type'] = row.set_piece_type === 'corner_left' || row.set_piece_type === 'corner_right' ? 'corner' : row.set_piece_type;
    const existing = setPieceRolesByPlayer.get(playerId) ?? [];
    const already = existing.find((r) => r.type === type);
    if (already) already.rank = Math.min(already.rank, row.rank);
    else existing.push({ type, rank: row.rank });
    setPieceRolesByPlayer.set(playerId, existing);
  }

  const squadStatusByPlayer = new Map<number, SquadStatus>();
  for (const row of (squadRows ?? []) as PlayerSquadHierarchyRow[]) squadStatusByPlayer.set(row.fpl_player_id, row.squad_status);

  const gamesInvolvedByPlayer = await getGamesInvolvedCounts(playerIds);
  const seasonStatsByPlayer = new Map<number, ReturnType<typeof seasonContextStats>>();
  for (const row of playerRows ?? []) seasonStatsByPlayer.set(row.fpl_player_id, seasonContextStats(row, gamesInvolvedByPlayer.get(row.fpl_player_id) ?? null));

  // Same guard as getFixtureProjection: a feed row with no player id can't
  // be keyed into the output map.
  const v6Projected = ((v6Rows ?? []) as FplProjectionFrontendFeedV6[]).filter(
    (p): p is ProjectedRow => p.fpl_player_id !== null
  );
  for (const proj of v6Projected) {
    out.set(proj.fpl_player_id, {
      fpl_player_id: proj.fpl_player_id,
      tactical_role: proj.tactical_role,
      position_signal: computePositionSignal(asElementType(proj.fpl_position), proj.tactical_role),
      start_probability: num(proj.start_probability),
      lineup_confidence: num(proj.lineup_confidence),
      set_piece_roles: setPieceRolesByPlayer.get(proj.fpl_player_id) ?? [],
      squad_status: squadStatusByPlayer.get(proj.fpl_player_id) ?? null,
      season_points_per_game: seasonStatsByPlayer.get(proj.fpl_player_id)?.points_per_game ?? null,
    });
  }
  return out;
}
