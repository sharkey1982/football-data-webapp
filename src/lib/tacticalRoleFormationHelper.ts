// ============================================================================
// src/lib/tacticalRoleFormationHelper.ts
//
// Converts TacticalRoleRow[] (season-long default roles, not tied to any
// one fixture) into the FplFixtureProjectionPlayer shape FormationPitch
// expects, and infers a formation string from the depth_rank=1 starters'
// roles. FormationPitch already falls back to evenly-spaced lines for any
// formation string without a pre-built template, so this inference only
// needs to be reasonable, not exact.
// ============================================================================

import type { TacticalRoleRow } from './tacticalRoleAdminApi';
import { computePositionSignal, type FplFixtureProjectionPlayer } from './fplApi';
import { FPL_POSITION_LABEL } from './fplApi';

const DEF_ROLES = new Set(['CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB', 'DEF']);
const FWD_ROLES = new Set(['CF', 'FWD']);
// Everything else (DM/CM/AM/LW/RW/MID) counts as midfield for the purposes
// of inferring a D-M-F formation string.

export function inferFormation(starters: TacticalRoleRow[]): string {
  let def = 0;
  let mid = 0;
  let fwd = 0;
  for (const p of starters) {
    if (p.tactical_role === 'GK') continue;
    if (DEF_ROLES.has(p.tactical_role)) def++;
    else if (FWD_ROLES.has(p.tactical_role)) fwd++;
    else mid++;
  }
  return def > 0 || mid > 0 || fwd > 0 ? `${def}-${mid}-${fwd}` : '4-3-3';
}

export function toFormationPitchPlayer(row: TacticalRoleRow): FplFixtureProjectionPlayer {
  return {
    fpl_player_id: row.fpl_player_id,
    web_name: row.web_name,
    fpl_position: row.element_type,
    fpl_position_label: FPL_POSITION_LABEL[row.element_type],
    tactical_role: row.tactical_role === 'Unknown' ? null : row.tactical_role,
    tactical_role_sources: null,
    position_signal: computePositionSignal(row.element_type, row.tactical_role === 'Unknown' ? null : row.tactical_role),
    set_piece_roles: row.set_piece_roles,
    squad_status: row.depth_rank === 1 ? 'first_choice' : row.depth_rank !== null && row.depth_rank >= 3 ? 'backup' : row.depth_rank === 2 ? 'rotation' : null,
    penalty_points_share: null,
    expected_minutes: null,
    expected_goals: null,
    expected_assists: null,
    expected_fpl_points: null,
    price: null,
    value: null,
    start_probability: null,
    sub_appearance_probability: null,
    availability_probability: null,
    lineup_confidence: null,
    clean_sheet_probability: null,
    expected_saves: null,
    expected_bonus: null,
    defensive_contribution_probability: null,
    xpts: {
      appearance: null,
      goals: null,
      assists: null,
      clean_sheet: null,
      saves: null,
      defensive_contribution: null,
      goals_conceded: null,
      cards_own_goals: null,
      penalties: null,
      bonus: null,
    },
    status: null,
    news: null,
    season_points_per_game: row.points_per_game,
    season_avg_minutes_per_start: row.avg_minutes_per_start,
  };
}
