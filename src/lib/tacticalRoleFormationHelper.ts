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

/** Selects the players effectively "at" one depth rank (1st choice by
 * default) -- with role-aware injury promotion: if a player assigned
 * that depth is currently injured, the replacement is the healthy player
 * who plays the SAME tactical_role at the next depth rank up (same FPL
 * position), not merely whoever's next by overall rank. This matters
 * because depth_rank ranks a whole FPL position together (e.g. every
 * defender), not one slot at a time -- two players can share a
 * position's other slots at the SAME depth (e.g. Gabriel at LCB and
 * Saliba at RCB, both depth_rank 1) without either being a backup for
 * the other; picking "whoever's simply next by rank" when Saliba (RCB)
 * is injured could grab a same-rank left-back or right-back instead of
 * the actual RCB backup, purely by chance of array order on a tie.
 * Falls back to nearest-rank-any-role only if no same-role replacement
 * exists, and cascades through further ranks if that replacement is also
 * injured. How many players show per position is however many were
 * actually assigned that depth (a team can genuinely have several
 * players all marked 1st choice within one FPL position), not a fixed
 * formation count -- an incomplete-looking pitch when a position doesn't
 * have enough ranked players is the honest, expected result. */
export function selectStartersAtDepth(teamRows: TacticalRoleRow[], depth: number): TacticalRoleRow[] {
  const byPosition = new Map<number, TacticalRoleRow[]>();
  for (const r of teamRows) byPosition.set(r.element_type, [...(byPosition.get(r.element_type) ?? []), r]);

  const result: TacticalRoleRow[] = [];
  for (const players of byPosition.values()) {
    const atDepth = players.filter((p) => p.depth_rank === depth);
    const used = new Set<number>();

    for (const p of atDepth) {
      if (p.status !== 'i') {
        result.push(p);
        used.add(p.fpl_player_id);
        continue;
      }
      // Injured -- find a healthy replacement at the nearest higher depth
      // rank, preferring the same tactical_role over merely the next
      // rank, and never reusing someone already placed.
      const pool = players
        .filter((c) => c.depth_rank !== null && c.depth_rank > depth && c.status !== 'i' && !used.has(c.fpl_player_id))
        .sort((a, b) => (a.depth_rank ?? 99) - (b.depth_rank ?? 99));
      const sameRole = pool.filter((c) => c.tactical_role === p.tactical_role);
      const replacement = sameRole[0] ?? pool[0];
      if (replacement) {
        result.push(replacement);
        used.add(replacement.fpl_player_id);
      }
    }
  }
  return result;
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
