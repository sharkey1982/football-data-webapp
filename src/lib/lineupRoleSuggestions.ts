// ============================================================================
// src/lib/lineupRoleSuggestions.ts
//
// "Suggested from line-ups" on Tactical Roles (12 Oct 2026). Counts where
// each player actually started in the line-ups recorded from Chris's BBC
// screenshots (fixture_lineup_positions) and, where one position clearly
// dominates and differs from his main role, suggests it. Nothing changes
// until an admin presses Accept: screenshots alone never move a main
// position (Chris, 11 Oct).
// ============================================================================

/** One recorded start: who, for which club, in which position. */
export interface LineupStart {
  fpl_player_id: number;
  team_id: number;
  tactical_role: string;
}

export interface LineupRoleSummary {
  /** Starts recorded for him at his current club. */
  starts: number;
  /** Starts per position, most first. */
  byRole: { role: string; n: number }[];
  /** The position to suggest as his main one, or null when none qualifies. */
  suggested: string | null;
}

/** A suggestion needs at least this many starts in the position... */
export const MIN_STARTS_IN_ROLE = 2;
/** ...and at least this share of all his recorded starts. */
export const MIN_SHARE = 0.6;

/** Per player (at his current club): his recorded starts by position, and
 * a suggested main position when one clearly dominates and isn't already
 * his main role. Ties never produce a suggestion. */
export function summariseLineupRoles(
  starts: LineupStart[],
  players: { fpl_player_id: number; team_id: number; tactical_role: string }[]
): Map<number, LineupRoleSummary> {
  const counts = new Map<string, Map<string, number>>();
  for (const s of starts) {
    const key = `${s.team_id}:${s.fpl_player_id}`;
    const m = counts.get(key) ?? new Map<string, number>();
    m.set(s.tactical_role, (m.get(s.tactical_role) ?? 0) + 1);
    counts.set(key, m);
  }
  const out = new Map<number, LineupRoleSummary>();
  for (const p of players) {
    const m = counts.get(`${p.team_id}:${p.fpl_player_id}`);
    if (!m) continue;
    const byRole = [...m.entries()].map(([role, n]) => ({ role, n })).sort((a, b) => b.n - a.n || a.role.localeCompare(b.role));
    const total = byRole.reduce((s, r) => s + r.n, 0);
    const top = byRole[0];
    const tied = byRole.length > 1 && byRole[1].n === top.n;
    const qualifies = !tied && top.n >= MIN_STARTS_IN_ROLE && top.n / total >= MIN_SHARE && top.role !== p.tactical_role;
    out.set(p.fpl_player_id, { starts: total, byRole, suggested: qualifies ? top.role : null });
  }
  return out;
}

/** Roles that are placeholders rather than real positions. */
const GENERIC_ROLES = new Set(['GK', 'DEF', 'MID', 'FWD', 'Unknown']);

/** What Accept does, as a swap so nothing he plays is lost:
 *  - the suggested position becomes his main role;
 *  - if it was one of his "also plays", his rank there becomes his depth
 *    rank, otherwise his depth rank stays as it is;
 *  - his old main role (if a real position) moves to "also plays" at his
 *    old depth rank (2nd when he had none). */
export function planAccept(
  row: { tactical_role: string; depth_rank: number | null; other_positions: { role: string; rank: number }[] },
  suggested: string
): { mainRole: string; depthRank: number | null; removeOther: string | null; addOther: { role: string; rank: number } | null } {
  const existing = row.other_positions.find((o) => o.role === suggested);
  const oldMainIsReal = !GENERIC_ROLES.has(row.tactical_role) && row.tactical_role !== suggested;
  return {
    mainRole: suggested,
    depthRank: existing ? existing.rank : row.depth_rank,
    removeOther: existing ? suggested : null,
    addOther: oldMainIsReal ? { role: row.tactical_role, rank: row.depth_rank ?? 2 } : null,
  };
}
