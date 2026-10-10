// ============================================================================
// Shark Fantasy engine: a season. 9 single round-robin rounds, then Finals
// Sunday (round 10): 1v2 (the Shark Shield Final), 3v4, 5v6, 7v8, 9v10 on
// the table after round 9. Every club plays once every round, so fantasy
// scoring is the same every week. Club state (injuries, suspensions, form)
// carries between rounds.
// ============================================================================
import { stream, clamp } from './rng';
import { DISCIPLINE } from './params';
import { newClubState, selectLineup } from './manager';
import type { ClubState } from './manager';
import { simulateMatch, shootout } from './match';
import { bonusForMatch, fantasyPoints } from './scoring';
import type { MatchResult, World } from './types';

export interface Fixture { round: number; homeId: string; awayId: string; kind: 'league' | 'final' | 'placing' }
export interface TableRow { clubId: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }

/** Circle-method single round-robin; home and away balanced, swapped by `flip`. */
export function roundRobin(ids: string[], flip = false): Fixture[] {
  const n = ids.length, arr = ids.slice(), out: Fixture[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      // the fixed club alternates; the others by position: every club home
      // 4 or 5 times, never more than 2 home or away in a row (tested)
      const firstHome = i === 0 ? r % 2 === 0 : i % 2 === 1;
      const homeFirst = flip ? !firstHome : firstHome;
      out.push({ round: r + 1, homeId: homeFirst ? a : b, awayId: homeFirst ? b : a, kind: 'league' });
    }
    arr.splice(1, 0, arr.pop()!);
  }
  return out;
}

export function table(world: World, results: MatchResult[], tiebreakSeed: string): TableRow[] {
  const rows: Record<string, TableRow> = {};
  for (const c of world.clubs) rows[c.id] = { clubId: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  for (const r of results) {
    const h = rows[r.homeId], a = rows[r.awayId];
    h.p++; a.p++; h.gf += r.homeGoals; h.ga += r.awayGoals; a.gf += r.awayGoals; a.ga += r.homeGoals;
    if (r.homeGoals > r.awayGoals) { h.w++; a.l++; h.pts += 3; }
    else if (r.homeGoals < r.awayGoals) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  const draw = stream(`${tiebreakSeed}|tiebreak`), lot: Record<string, number> = {};
  for (const c of world.clubs) lot[c.id] = draw.next();
  return Object.values(rows).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || lot[x.clubId] - lot[y.clubId]);
}

export interface SeasonResult {
  season: number;
  results: MatchResult[];
  leagueTable: TableRow[];     // after round 9
  shieldWinner: string;
  points: Record<string, number[]>; // playerId → fantasy points per round (0 if not involved)
  bonus: Record<string, number>[];  // per match
}

/** A season in progress, played one round at a time (the fantasy game
 *  needs to act between rounds). */
export interface SeasonState {
  world: World;
  season: number;
  fixtures: Fixture[];
  states: Record<string, ClubState>;
  results: MatchResult[];
  bonus: Record<string, number>[];
  points: Record<string, number[]>;   // playerId → fantasy points per round
  minutes: Record<string, number[]>;  // playerId → minutes per round
  roundsPlayed: number;
  leagueTable: TableRow[];
  shieldWinner: string;
}

export function startSeason(world: World, season: number): SeasonState {
  const ids = world.clubs.map(c => c.id);
  const fixtures = roundRobin(stream(`${world.seed}|s${season}|order`).shuffle(ids), season % 2 === 0);
  const states: Record<string, ClubState> = {};
  for (const id of ids) states[id] = newClubState();
  const points: Record<string, number[]> = {}, minutes: Record<string, number[]> = {};
  for (const p of world.players) { points[p.id] = Array(10).fill(0); minutes[p.id] = Array(10).fill(0); }
  return { world, season, fixtures, states, results: [], bonus: [], points, minutes, roundsPlayed: 0, leagueTable: [], shieldWinner: '' };
}

/** The fixtures of a round. Round 10 (Finals Sunday) exists once round 9 is played. */
export function roundFixtures(ss: SeasonState, round: number): Fixture[] {
  if (round <= 9) return ss.fixtures.filter(f => f.round === round);
  if (ss.roundsPlayed < 9) return [];
  const order = ss.leagueTable.map(r => r.clubId), out: Fixture[] = [];
  for (let i = 0; i < 10; i += 2) out.push({ round: 10, homeId: order[i], awayId: order[i + 1], kind: i === 0 ? 'final' : 'placing' });
  return out;
}

/** Play the next round. Idempotent by design: a round is played once. */
export function playRound(ss: SeasonState): MatchResult[] {
  const round = ss.roundsPlayed + 1, world = ss.world, season = ss.season;
  if (round > 10) throw new Error('season over');
  const out: MatchResult[] = [];
  for (const f of roundFixtures(ss, round)) {
    const key = `s${season}|r${round}|${f.homeId}-${f.awayId}`;
    const sel = stream(`${world.seed}|${key}|selection`);
    const home = selectLineup(world, f.homeId, ss.states[f.homeId], round, sel);
    const away = selectLineup(world, f.awayId, ss.states[f.awayId], round, sel);
    const r = simulateMatch(world, key, home, away);
    if (f.kind !== 'league' && r.homeGoals === r.awayGoals) {
      r.shootout = shootout(r.seed, home.xi, away.xi);
      r.events.push({ seq: r.events.length, minute: 90, type: 'shootout', side: r.shootout.winner, detail: { home: r.shootout.home, away: r.shootout.away } });
    }
    const b = bonusForMatch(r.stats);
    ss.bonus.push(b);
    for (const s of r.stats) { ss.points[s.playerId][round - 1] += fantasyPoints(s, b[s.playerId] ?? 0).total; ss.minutes[s.playerId][round - 1] += s.minutes; }
    afterMatch(world, r, ss.states, round);
    ss.results.push(r); out.push(r);
    if (f.kind === 'final') ss.shieldWinner = r.homeGoals > r.awayGoals ? r.homeId : r.homeGoals < r.awayGoals ? r.awayId : (r.shootout!.winner === 'home' ? r.homeId : r.awayId);
  }
  ss.roundsPlayed = round;
  if (round === 9) ss.leagueTable = table(world, ss.results, `${world.seed}|s${season}`);
  return out;
}

/** Play a whole season (offline: no fantasy entries). */
export function playSeason(world: World, season: number): SeasonResult {
  const ss = startSeason(world, season);
  for (let r = 1; r <= 10; r++) playRound(ss);
  return { season, results: ss.results, leagueTable: ss.leagueTable, shieldWinner: ss.shieldWinner, points: ss.points, bonus: ss.bonus };
}

/** Injuries, suspensions and form after a match (deterministic per match). */
export function afterMatch(world: World, r: MatchResult, states: Record<string, ClubState>, round: number) {
  const rng = stream(`${r.seed}|after`);
  for (const s of r.stats) {
    const p = world.players.find(x => x.id === s.playerId)!;
    const st = states[p.clubId];
    if (s.injured) st.injuredUntilRound[p.id] = round + 1 + Math.min(4, rng.poisson(1.2 * (1 + (50 - p.hidden.fitness) / 100)));
    if (s.red) st.suspendedUntilRound[p.id] = round + 1 + DISCIPLINE.redBan;
    if (s.yellow) {
      st.yellows[p.id] = (st.yellows[p.id] ?? 0) + s.yellow;
      if (st.yellows[p.id] >= DISCIPLINE.yellowsForBan) { st.suspendedUntilRound[p.id] = Math.max(st.suspendedUntilRound[p.id] ?? 0, round + 2); st.yellows[p.id] = 0; }
    }
    // form drifts towards how they played, and back towards zero
    const f = st.form[p.id] ?? 0, perf = s.goals * 2 + s.assists + (s.cleanSheet ? 1 : 0) - s.red * 2;
    st.form[p.id] = clamp(f * 0.7 + perf * 0.6 + rng.normal(0, 0.6), -5, 5);
  }
}
