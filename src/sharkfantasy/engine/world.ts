// ============================================================================
// Shark Fantasy engine: generate a football universe from a seed.
// 10 clubs, 20 players each (2 GK, 6 DEF, 7 MID, 5 FWD), a manager each.
// Club quality offsets (params WORLD.clubOffsets) set competitive balance.
// ============================================================================
import { stream, clamp } from './rng';
import type { Rng } from './rng';
import { ENGINE_VERSION, WORLD } from './params';
import { REGIONS, REGION_WEIGHTS, PLACES, CLUB_SUFFIX, MANAGER_FIRST, MANAGER_LAST } from './names';
import type { Club, HiddenAttrs, Manager, Player, Position, World } from './types';
import { teamStrength, defaultXI } from './strength';

const FORMATIONS = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-5-1', '5-3-2', '3-4-3'] as const;

function personName(rng: Rng, used: Set<string>): { name: string; nat: string } {
  const keys = Object.keys(REGIONS), ws = keys.map(k => REGION_WEIGHTS[k] ?? 1);
  for (let tries = 0; tries < 200; tries++) {
    const r = REGIONS[keys[rng.weighted(ws)]];
    const name = `${rng.pick(r.first)} ${rng.pick(r.last)}`;
    if (!used.has(name)) { used.add(name); return { name, nat: r.nat }; }
  }
  throw new Error('ran out of names');
}

/** Hidden attributes for a player of this position at a club quality q (≈ 60 ± 7). */
function attrs(rng: Rng, pos: Position, q: number, depth: number): HiddenAttrs {
  const n = (m: number, sd: number) => clamp(Math.round(rng.normal(m, sd)), 1, 99);
  const lift = q - 60 - depth * WORLD.depthDrop; // first-choice players are better
  const base = {
    GK:  { fin: 8,  cre: 22, def: 30, gk: 66 },
    DEF: { fin: 34, cre: 46, def: 66, gk: 5 },
    MID: { fin: 54, cre: 64, def: 50, gk: 5 },
    FWD: { fin: 68, cre: 55, def: 30, gk: 5 },
  }[pos];
  return {
    finishing: n(base.fin + (pos === 'FWD' || pos === 'MID' ? lift : lift * 0.4), 7),
    creativity: n(base.cre + (pos === 'GK' ? 0 : lift * 0.8), 7),
    defending: n(base.def + (pos === 'DEF' || pos === 'MID' ? lift : lift * 0.3), 7),
    goalkeeping: pos === 'GK' ? n(base.gk + lift, 6) : 5,
    fitness: n(62, 12),
    discipline: n(60, 14),
    injuryProneness: n(50, 14),
    potential: n(62 + lift * 0.5, 10),
  };
}

export function generateWorld(seed: string, universe = 'test'): World {
  const rng = stream(`${universe}|world|${seed}`);
  const used = new Set<string>();
  const places = rng.shuffle(PLACES).slice(0, WORLD.clubs);
  const offsets = rng.shuffle(WORLD.clubOffsets);
  const clubs: Club[] = [], managers: Manager[] = [], players: Player[] = [];
  places.forEach((place, ci) => {
    const id = `c${ci + 1}`, mid = `m${ci + 1}`;
    const suffix = rng.pick(CLUB_SUFFIX);
    clubs.push({ id, name: `${place} ${suffix}`, short: place.slice(0, 3).toUpperCase(), managerId: mid,
      homeBoost: 1 + rng.next() * 0.08 });
    managers.push({ id: mid, name: `${rng.pick(MANAGER_FIRST)} ${rng.pick(MANAGER_LAST)}`,
      rotation: Math.round(rng.next() * 100) / 100, attackLean: Math.round((rng.next() * 2 - 1) * 100) / 100,
      formations: rng.shuffle(FORMATIONS).slice(0, 3) });
    const q = 60 + offsets[ci];
    let pn = 0;
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
      const n = WORLD.squad[pos];
      for (let i = 0; i < n; i++) {
        // depth: 0 for the likely starters, rising for back-ups
        const starters = { GK: 1, DEF: 4, MID: 4, FWD: 2 }[pos];
        const depth = i < starters ? 0 : (i - starters + 1) / Math.max(1, n - starters);
        const { name, nat } = personName(rng, used);
        players.push({ id: `${id}p${++pn}`, clubId: id, name, nationality: nat,
          age: clamp(Math.round(rng.normal(26, 4)), 17, 36), position: pos, identity: 'original',
          hidden: attrs(rng, pos, q, depth) });
      }
    }
  });
  const world: World = { universe, engineVersion: ENGINE_VERSION, seed, clubs, managers, players, baseline: { attack: 0, defence: 0 } };
  // Baseline: the average club's strongest XI, so expected goals are centred.
  const s = clubs.map(c => teamStrength(defaultXI(world, c.id)));
  world.baseline = { attack: s.reduce((a, x) => a + x.attack, 0) / s.length, defence: s.reduce((a, x) => a + x.defence, 0) / s.length };
  return world;
}
