// ============================================================================
// src/lib/tacticalRoleFormationHelper.ts
//
// Converts TacticalRoleRow[] (season-long default roles, not tied to any
// one fixture) into the FplFixtureProjectionPlayer shape FormationPitch
// expects. Formation comes from the team's own real formation
// (fixture_team_tactical_consensus, stable across the season) rather than
// being inferred from whoever happens to be selected -- parseFormationCounts
// turns e.g. "4-2-3-1" into how many DEF/MID/FWD-line starters that
// formation actually needs (4/5/1 -- the middle numbers sum into one
// midfield count), which is what picks exactly that many players by
// depth_rank per line, instead of an arbitrary fixed cap.
// ============================================================================

import type { TacticalRoleRow } from './tacticalRoleAdminApi';
import { computePositionSignal, type FplFixtureProjectionPlayer } from './fplApi';
import { FPL_POSITION_LABEL } from './fplApi';

/** "4-2-3-1" -> {def: 4, mid: 5, fwd: 1} (the middle numbers sum into one
 * midfield count). Falls back to a plain 4-3-3 shape if the string is
 * missing or doesn't parse cleanly, so the pitch still renders something
 * reasonable rather than nothing. */
export function parseFormationCounts(formation: string | null): { def: number; mid: number; fwd: number } {
  const parts = (formation ?? '').split('-').map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return { def: 4, mid: 3, fwd: 3 };
  const def = parts[0];
  const fwd = parts[parts.length - 1];
  const mid = parts.slice(1, -1).reduce((sum, n) => sum + n, 0);
  return { def, mid, fwd };
}

/** Selects exactly the starters a formation needs, by depth_rank, from
 * a team's full player pool -- not an arbitrary cap. Players without a
 * depth_rank yet are never included (nothing to rank them by). */
export function selectStartersForFormation(teamRows: TacticalRoleRow[], formation: string | null): TacticalRoleRow[] {
  const counts = parseFormationCounts(formation);
  const byRank = (r: TacticalRoleRow) => r.depth_rank ?? 99;
  const gk = teamRows.filter((r) => r.element_type === 1 && r.depth_rank !== null).sort((a, b) => byRank(a) - byRank(b))[0];
  const defPlayers = teamRows.filter((r) => r.element_type === 2 && r.depth_rank !== null).sort((a, b) => byRank(a) - byRank(b));
  const midPlayers = teamRows.filter((r) => r.element_type === 3 && r.depth_rank !== null).sort((a, b) => byRank(a) - byRank(b));
  const fwdPlayers = teamRows.filter((r) => r.element_type === 4 && r.depth_rank !== null).sort((a, b) => byRank(a) - byRank(b));

  return [...(gk ? [gk] : []), ...defPlayers.slice(0, counts.def), ...midPlayers.slice(0, counts.mid), ...fwdPlayers.slice(0, counts.fwd)];
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
    status: row.status,
    news: row.news,
    season_points_per_game: row.points_per_game,
    season_avg_minutes_per_start: row.avg_minutes_per_start,
  };
}
