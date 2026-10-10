// ============================================================================
// Shark Fantasy engine: generate a universe from a seed (world v2).
// The ten clubs of the Beat the Shark world (catalogue.ts), 15 players each
// (2 GK, 5 DEF, 5 MID, 3 FWD), every player a type at a club. The seed decides
// which general types fill each squad and the exact abilities; the club's
// quality offset and the type decide the level.
// ============================================================================
import { stream, clamp } from './rng';
import type { Rng } from './rng';
import { ENGINE_VERSION, WORLD } from './params';
import { CLUBS, TYPES, TYPE_BY_NAME, SLOTS, type PlayerType } from './catalogue';
import type { Club, HiddenAttrs, Manager, Player, Position, World } from './types';
import { teamStrength, defaultXI } from './strength';

export const WORLD_VERSION = 'sf-world-2';

const BASE: Record<Position, { fin: number; cre: number; def: number; gk: number }> = {
  GK: { fin: 8, cre: 22, def: 30, gk: 66 },
  DEF: { fin: 34, cre: 46, def: 66, gk: 5 },
  MID: { fin: 54, cre: 64, def: 50, gk: 5 },
  FWD: { fin: 68, cre: 55, def: 30, gk: 5 },
};

/** Hidden attributes for a type at a club quality q, as a first choice (depth 0) or squad player (1). */
function attrs(rng: Rng, t: PlayerType, q: number, depth: number): HiddenAttrs {
  const n = (m: number, sd: number) => clamp(Math.round(rng.normal(m, sd)), 1, 99);
  const pos = t.pos, b = BASE[pos];
  const lift = q - 60 - depth * WORLD.depthDrop + (t.q ?? 0);
  return {
    finishing: n(b.fin + (t.fin ?? 0) + (pos === 'FWD' || pos === 'MID' ? lift : lift * 0.4), 4),
    creativity: n(b.cre + (t.cre ?? 0) + (pos === 'GK' ? 0 : lift * 0.8), 4),
    defending: n(b.def + (t.def ?? 0) + (pos === 'DEF' || pos === 'MID' ? lift : lift * 0.3), 4),
    goalkeeping: pos === 'GK' ? n(b.gk + (t.gk ?? 0) + lift, 3) : 5,
    fitness: t.fitness ?? n(62, 8),
    discipline: t.discipline ?? n(60, 10),
    injuryProneness: t.injury ?? n(50, 10),
    potential: t.potential ?? n(62 + lift * 0.5, 8),
  };
}

/** Which type fills each slot: the club's signatures first (the most constrained first), then general types. */
export function squadTypes(rng: Rng, signature: string[]): { pos: Position; depth: 0 | 1; type: PlayerType }[] {
  const slots = (['GK', 'DEF', 'MID', 'FWD'] as Position[]).flatMap((pos) => SLOTS[pos].map((depth) => ({ pos, depth, type: null as PlayerType | null })));
  const sig = signature.map((n) => TYPE_BY_NAME.get(n)!).sort((a, b) => a.depth.length - b.depth.length);
  for (const t of sig) {
    const s = slots.find((x) => !x.type && x.pos === t.pos && t.depth.includes(x.depth));
    if (!s) throw new Error(`no slot for ${t.name}`);
    s.type = t;
  }
  // squad players first (their pool is smaller), then the first choices
  for (const s of [...slots.filter((x) => x.depth === 1), ...slots.filter((x) => x.depth === 0)]) {
    if (s.type) continue;
    const used = new Set(slots.map((x) => x.type?.name));
    const pool = TYPES.filter((t) => t.pos === s.pos && !t.unique && t.depth.includes(s.depth) && !used.has(t.name));
    s.type = rng.pick(pool);
  }
  return slots as { pos: Position; depth: 0 | 1; type: PlayerType }[];
}

export function generateWorld(seed: string, universe = 'test'): World {
  const rng = stream(`${universe}|world|${seed}`);
  const clubs: Club[] = [], managers: Manager[] = [], players: Player[] = [];
  for (const def of CLUBS) {
    const mid = `${def.id}-m`;
    clubs.push({ id: def.id, name: def.name, short: def.short, managerId: mid, homeBoost: 1 + rng.next() * 0.08 });
    managers.push({ id: mid, name: def.manager.name, rotation: def.manager.rotation, attackLean: def.manager.attackLean, formations: def.manager.formations });
    const q = 60 + def.offset;
    let pn = 0;
    for (const s of squadTypes(rng, def.signature)) {
      const t = s.type;
      players.push({ id: `${def.id}p${++pn}`, clubId: def.id, name: t.name, nationality: '',
        age: rng.int(t.age[0], t.age[1]), position: s.pos, identity: 'original', hidden: attrs(rng, t, q, s.depth) });
    }
  }
  const world: World = { universe, engineVersion: ENGINE_VERSION, seed, clubs, managers, players, baseline: { attack: 0, defence: 0 } };
  // Baseline: the average club's strongest XI, so expected goals are centred.
  const s = clubs.map((c) => teamStrength(defaultXI(world, c.id)));
  world.baseline = { attack: s.reduce((a, x) => a + x.attack, 0) / s.length, defence: s.reduce((a, x) => a + x.defence, 0) / s.length };
  return world;
}

/** The one-line character of a player's type. */
export const typeLine = (name: string) => TYPE_BY_NAME.get(name)?.line ?? '';
