// ============================================================================
// Shark Fantasy engine: AI club managers pick the team.
// Rules, not whims: the available squad (no injured or suspended players),
// one of the manager's formations that the squad can fill, and the best
// players for it, with a little rotation noise for managers who rotate.
// ============================================================================
import type { Rng } from './rng';
import type { Player, Position, World } from './types';
import { formationShape, pickXI, rating } from './strength';
import type { Lineup } from './strength';

/** What a club carries from week to week. */
export interface ClubState {
  injuredUntilRound: Record<string, number>; // playerId → first round available again
  suspendedUntilRound: Record<string, number>;
  yellows: Record<string, number>;           // season count towards a ban
  form: Record<string, number>;               // hidden form, −5 … +5
}
export function newClubState(): ClubState {
  return { injuredUntilRound: {}, suspendedUntilRound: {}, yellows: {}, form: {} };
}

export function available(p: Player, st: ClubState, round: number): boolean {
  return (st.injuredUntilRound[p.id] ?? 0) <= round && (st.suspendedUntilRound[p.id] ?? 0) <= round;
}

export function selectLineup(world: World, clubId: string, st: ClubState, round: number, rng: Rng): Lineup {
  const club = world.clubs.find(c => c.id === clubId)!;
  const mgr = world.managers.find(m => m.id === club.managerId)!;
  const squad = world.players.filter(p => p.clubId === clubId && available(p, st, round));
  const count = (pos: Position) => squad.filter(p => p.position === pos).length;
  const fits = (f: string) => { const s = formationShape(f); return (['GK', 'DEF', 'MID', 'FWD'] as Position[]).every(pos => count(pos) >= s[pos]); };
  const options = mgr.formations.filter(fits);
  const formation = options.length ? options[rng.weighted(options.map((_, i) => 3 - i))] : '4-5-1';
  const noise: Record<string, number> = {};
  for (const p of squad) noise[p.id] = rng.normal(0, 7 * mgr.rotation);
  const score = (p: Player) => rating(p) + (st.form[p.id] ?? 0) + noise[p.id];
  const l = pickXI(squad, formation, clubId, score);
  // Short of a position (injuries): fill from the bench with the best outfielders.
  while (l.xi.length < 11 && l.bench.length) {
    const i = l.bench.findIndex(p => p.position !== 'GK');
    l.xi.push(l.bench.splice(i >= 0 ? i : 0, 1)[0]);
  }
  return l;
}
