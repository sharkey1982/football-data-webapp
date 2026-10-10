// ============================================================================
// Shark Fantasy: what managers can see (design §8). The fantasy side — the
// projections, the bots, and later the site — reads ONLY this view, never
// the hidden attributes. In the database it becomes the public sf_* views.
//
// Scouting reports are the hidden attributes plus noise (published once a
// season, sd SCOUT_NOISE): informative, never exact. Everything else is
// what has happened: results, minutes, goals, assists, cards, injuries and
// bans (with their return round).
// ============================================================================
import { stream, clamp } from '../engine/rng';
import type { Position } from '../engine/types';
import type { SeasonState } from '../engine/season';
import { roundFixtures } from '../engine/season';

export const SCOUT_NOISE = 6;

export interface PublicPlayer {
  id: string; name: string; clubId: string; position: Position; age: number;
  scout: { attack: number; creativity: number; defence: number; keeping: number; discipline: number };
  availableFrom: number;   // first round he can play (injury or ban)
  history: { round: number; minutes: number; started: boolean; goals: number; assists: number; cleanSheet: boolean; points: number }[];
}
export interface PublicView {
  season: number;
  nextRound: number;
  players: PublicPlayer[];
  clubs: { id: string; name: string }[];
  results: { round: number; homeId: string; awayId: string; homeGoals: number; awayGoals: number }[];
  fixtures: { round: number; homeId: string; awayId: string }[];
}

export function publicView(ss: SeasonState): PublicView {
  const w = ss.world, rng = stream(`${w.seed}|s${ss.season}|scouting`);
  const players: PublicPlayer[] = w.players.map(p => {
    const n = (x: number) => clamp(Math.round(x + rng.normal(0, SCOUT_NOISE)), 1, 99);
    const st = ss.states[p.clubId];
    const hist: PublicPlayer['history'] = [];
    return { id: p.id, name: p.name, clubId: p.clubId, position: p.position, age: p.age,
      scout: { attack: n(p.hidden.finishing), creativity: n(p.hidden.creativity), defence: n(p.hidden.defending), keeping: n(p.hidden.goalkeeping), discipline: n(p.hidden.discipline) },
      availableFrom: Math.max(st.injuredUntilRound[p.id] ?? 0, st.suspendedUntilRound[p.id] ?? 0, 0), history: hist };
  });
  const byId = new Map(players.map(p => [p.id, p]));
  for (const r of ss.results) {
    const round = Number(/\|r(\d+)\|/.exec(r.fixtureKey)![1]);
    for (const s of r.stats) byId.get(s.playerId)!.history.push({ round, minutes: s.minutes, started: s.started, goals: s.goals, assists: s.assists, cleanSheet: s.cleanSheet, points: ss.points[s.playerId][round - 1] });
  }
  const results = ss.results.map(r => ({ round: Number(/\|r(\d+)\|/.exec(r.fixtureKey)![1]), homeId: r.homeId, awayId: r.awayId, homeGoals: r.homeGoals, awayGoals: r.awayGoals }));
  const fixtures: PublicView['fixtures'] = [];
  for (let round = ss.roundsPlayed + 1; round <= 10; round++) for (const f of roundFixtures(ss, round)) fixtures.push({ round, homeId: f.homeId, awayId: f.awayId });
  return { season: ss.season, nextRound: ss.roundsPlayed + 1, players, clubs: w.clubs.map(c => ({ id: c.id, name: c.name })), results, fixtures };
}
