// ============================================================================
// Shark Fantasy engine: lineups and team strength.
// Attack and defence of an XI from its players' hidden attributes, weighted
// by position. Expected goals then come from attack v the opponent's
// defence (match.ts), centred on the world's average club (world.baseline).
// ============================================================================
import type { Player, Position, World } from './types';

export interface Lineup {
  clubId: string;
  formation: string;
  xi: Player[];
  bench: Player[];
}

/** "4-3-3" → { GK:1, DEF:4, MID:3, FWD:3 }; "4-2-3-1" counts the 2+3 as MID. */
export function formationShape(f: string): Record<Position, number> {
  const parts = f.split('-').map(Number);
  const def = parts[0], fwd = parts[parts.length - 1], mid = 10 - def - fwd;
  return { GK: 1, DEF: def, MID: mid, FWD: fwd };
}

const ATT_W: Record<Position, number> = { GK: 0, DEF: 0.25, MID: 0.75, FWD: 1 };
const DEF_W: Record<Position, number> = { GK: 1.6, DEF: 1, MID: 0.5, FWD: 0.15 };

/** A player's attacking and defensive value (0–100 scale). */
export function attackValue(p: Player): number { return 0.6 * p.hidden.finishing + 0.4 * p.hidden.creativity; }
export function defenceValue(p: Player): number { return p.position === 'GK' ? p.hidden.goalkeeping : p.hidden.defending; }

export function teamStrength(l: Lineup): { attack: number; defence: number } {
  let a = 0, aw = 0, d = 0, dw = 0;
  for (const p of l.xi) {
    a += ATT_W[p.position] * attackValue(p); aw += ATT_W[p.position];
    d += DEF_W[p.position] * defenceValue(p); dw += DEF_W[p.position];
  }
  return { attack: aw ? a / aw : 0, defence: dw ? d / dw : 0 };
}

/** How good a player is in his own position (for selection). */
export function rating(p: Player): number {
  switch (p.position) {
    case 'GK': return p.hidden.goalkeeping;
    case 'DEF': return 0.75 * p.hidden.defending + 0.25 * p.hidden.creativity;
    case 'MID': return 0.4 * p.hidden.creativity + 0.3 * p.hidden.finishing + 0.3 * p.hidden.defending;
    case 'FWD': return 0.7 * p.hidden.finishing + 0.3 * p.hidden.creativity;
  }
}

/** The strongest XI in the manager's first formation, everyone available. */
export function defaultXI(world: World, clubId: string): Lineup {
  const club = world.clubs.find(c => c.id === clubId)!;
  const mgr = world.managers.find(m => m.id === club.managerId)!;
  return pickXI(world.players.filter(p => p.clubId === clubId), mgr.formations[0], clubId, p => rating(p));
}

/** Best XI for a formation by a score function; bench = best of the rest (7). */
export function pickXI(squad: Player[], formation: string, clubId: string, score: (p: Player) => number): Lineup {
  const shape = formationShape(formation);
  const xi: Player[] = [];
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
    const pool = squad.filter(p => p.position === pos).sort((a, b) => score(b) - score(a));
    xi.push(...pool.slice(0, shape[pos]));
  }
  const rest = squad.filter(p => !xi.includes(p)).sort((a, b) => score(b) - score(a));
  // bench: a keeper if there is one, then the best others
  const gk = rest.find(p => p.position === 'GK');
  const bench = (gk ? [gk] : []).concat(rest.filter(p => p !== gk)).slice(0, 7);
  return { clubId, formation, xi, bench };
}
