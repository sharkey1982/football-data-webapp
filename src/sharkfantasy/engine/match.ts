// ============================================================================
// Shark Fantasy engine: one match, minute by minute.
//
// Expected goals from the two XIs (strength.ts), then each minute: shots
// (each with an xG, taken by players in proportion to position × finishing),
// goals, assists, saves, penalties, own goals, cards, injuries and
// substitutions. The event log is the record; player stats are derived from
// it (deriveStats) and fantasy points from those (scoring.ts).
// Deterministic: the same world, lineups and seed give the same events.
// ============================================================================
import { stream, clamp } from './rng';
import { ENGINE_VERSION, MATCH } from './params';
import type { MatchEvent, MatchResult, Player, PlayerMatchStats, World } from './types';
import { teamStrength } from './strength';
import type { Lineup } from './strength';

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export function expectedGoals(world: World, home: Lineup, away: Lineup): { home: number; away: number } {
  const h = teamStrength(home), a = teamStrength(away), b = world.baseline;
  const hc = world.clubs.find(c => c.id === home.clubId)!;
  const adv = hc.homeBoost / 1.04;
  return {
    home: MATCH.homeXg * adv * Math.exp(MATCH.k * ((h.attack - b.attack) - (a.defence - b.defence)) / 10),
    away: MATCH.awayXg / adv * Math.exp(MATCH.k * ((a.attack - b.attack) - (h.defence - b.defence)) / 10),
  };
}

interface Live {
  onPitch: Record<Side, Player[]>;
  bench: Record<Side, Player[]>;
  subsLeft: Record<Side, number>;
  yellow: Set<string>;
}

export function simulateMatch(world: World, fixtureKey: string, home: Lineup, away: Lineup): MatchResult {
  const seed = `${world.universe}|${world.seed}|${fixtureKey}|${ENGINE_VERSION}`;
  const rng = stream(seed);
  const xg = expectedGoals(world, home, away);
  const events: MatchEvent[] = [];
  let seq = 0;
  const ev = (minute: number, type: MatchEvent['type'], side: Side, playerId?: string, detail?: MatchEvent['detail']) =>
    events.push({ seq: seq++, minute, type, side, playerId, detail });
  const live: Live = {
    onPitch: { home: home.xi.slice(), away: away.xi.slice() },
    bench: { home: home.bench.slice(), away: away.bench.slice() },
    subsLeft: { home: 5, away: 5 },
    yellow: new Set(),
  };
  const score: Record<Side, number> = { home: 0, away: 0 };
  const manDown: Record<Side, number> = { home: 0, away: 0 };
  ev(0, 'kickoff', 'home', undefined, { formationHome: home.formation, formationAway: away.formation });

  // Planned substitution minutes and injury minutes, drawn up front.
  const subPlan: Record<Side, number[]> = { home: [], away: [] };
  for (const s of ['home', 'away'] as Side[]) {
    const n = clamp(Math.round(rng.normal(MATCH.subsPerTeam, 1)), 1, 5);
    subPlan[s] = Array.from({ length: n }, () => rng.int(55, 88)).sort((a, b) => a - b);
  }
  const injuryAt: Record<string, number> = {};
  for (const p of [...home.xi, ...away.xi, ...home.bench, ...away.bench]) {
    if (rng.chance(MATCH.injuryRate * p.hidden.injuryProneness / 50)) injuryAt[p.id] = rng.int(1, 90);
  }

  const sideOf = (p: Player): Side => (p.clubId === home.clubId ? 'home' : 'away');
  const remove = (s: Side, p: Player) => { live.onPitch[s] = live.onPitch[s].filter(x => x !== p); };
  const substitute = (minute: number, s: Side, out: Player, reason: string) => {
    if (live.subsLeft[s] <= 0 || !live.bench[s].length) return false;
    const pool = live.bench[s];
    const same = pool.filter(b => b.position === out.position);
    const inn = (same.length ? same : pool.filter(b => b.position !== 'GK').length ? pool.filter(b => b.position !== 'GK') : pool)[0];
    live.bench[s] = pool.filter(b => b !== inn);
    remove(s, out); live.onPitch[s].push(inn); live.subsLeft[s]--;
    ev(minute, 'sub_off', s, out.id, { reason }); ev(minute, 'sub_on', s, inn.id);
    return true;
  };
  const pickWeighted = (players: Player[], w: (p: Player) => number) => players[rng.weighted(players.map(p => Math.max(0.0001, w(p))))];
  const goalFor = (minute: number, s: Side, scorer: Player | undefined, kind: 'goal' | 'pen_goal' | 'own_goal', ownScorer?: Player) => {
    score[s]++;
    if (kind === 'own_goal') ev(minute, 'own_goal', other(s), ownScorer!.id, { benefits: s });
    else if (kind === 'pen_goal') ev(minute, 'pen_goal', s, scorer!.id);
    ev(minute, 'goal', s, kind === 'own_goal' ? undefined : scorer!.id, { home: score.home, away: score.away, kind });
    if (kind === 'goal' && rng.chance(MATCH.assistRate)) {
      const mates = live.onPitch[s].filter(p => p !== scorer);
      if (mates.length) {
        const a = pickWeighted(mates, p => MATCH.assisterWeight[p.position] * (p.hidden.creativity / 60) ** 2);
        ev(minute, 'assist', s, a.id);
      }
    }
  };

  for (let minute = 1; minute <= 90; minute++) {
    for (const s of ['home', 'away'] as Side[]) {
      // injuries and planned substitutions
      for (const p of live.onPitch[s].slice()) {
        if (injuryAt[p.id] === minute) {
          ev(minute, 'injury', s, p.id);
          if (!substitute(minute, s, p, 'injury')) { remove(s, p); manDown[s]++; }
        }
      }
      while (subPlan[s].length && subPlan[s][0] === minute) {
        subPlan[s].shift();
        const outfield = live.onPitch[s].filter(p => p.position !== 'GK');
        if (!outfield.length) continue;
        const trailing = score[s] < score[other(s)];
        const out = pickWeighted(outfield, p => (110 - p.hidden.fitness) * (trailing && p.position === 'DEF' ? 1.6 : 1) * (p.position === 'DEF' ? 0.7 : 1));
        substitute(minute, s, out, 'tactical');
      }
      // the run of play
      const diff = score[s] - score[other(s)];
      let mult = 1;
      if (minute > 60 && diff < 0) mult *= MATCH.trailingBoost;
      if (minute > 60 && diff > 0) mult *= MATCH.leadingDamp;
      if (manDown[s]) mult *= MATCH.manDownAttack ** manDown[s];
      if (manDown[other(s)]) mult *= MATCH.manDownOpponent ** manDown[other(s)];
      const lambda = (s === 'home' ? xg.home : xg.away) * mult;
      // open play is what's left after the average from penalties and own goals
      const open = Math.max(0.05, lambda - MATCH.penaltyRate * MATCH.penaltyConversion - MATCH.ownGoalRate);
      const shotsRate = MATCH.shotsPerTeam * Math.sqrt(lambda / 1.465);
      const attackers = live.onPitch[s].filter(p => p.position !== 'GK');
      const keeper = live.onPitch[other(s)].find(p => p.position === 'GK');
      if (attackers.length && rng.chance(shotsRate / 90)) {
        const shooter = pickWeighted(attackers, p => MATCH.shooterWeight[p.position] * p.hidden.finishing / 60);
        const x = clamp((open / shotsRate) * -Math.log(1 - rng.next()), 0.01, 0.85);
        const finish = (0.75 + 0.25 * shooter.hidden.finishing / 60) / MATCH.finishNorm;
        if (rng.chance(x * finish)) goalFor(minute, s, shooter, 'goal');
        else if (rng.chance(MATCH.onTargetMiss) && keeper) {
          ev(minute, 'save', other(s), keeper.id, { shooter: shooter.id });
        } else ev(minute, 'shot', s, shooter.id, { xg: Math.round(x * 100) / 100 });
      }
      if (attackers.length && rng.chance(MATCH.penaltyRate * mult / 90)) {
        const taker = attackers.reduce((a, b) => (b.hidden.finishing > a.hidden.finishing ? b : a));
        if (rng.chance(MATCH.penaltyConversion)) goalFor(minute, s, taker, 'pen_goal');
        else {
          ev(minute, 'pen_miss', s, taker.id);
          if (keeper && rng.chance(MATCH.penaltySavedShare)) ev(minute, 'pen_save', other(s), keeper.id);
        }
      }
      if (rng.chance(MATCH.ownGoalRate / 90)) {
        const defs = live.onPitch[other(s)].filter(p => p.position === 'DEF' || p.position === 'GK');
        if (defs.length) goalFor(minute, s, undefined, 'own_goal', rng.pick(defs));
      }
      // discipline
      if (rng.chance(MATCH.yellowRate / 90) && live.onPitch[s].length) {
        // a booked player is careful: much less likely to be booked again
        const p = pickWeighted(live.onPitch[s], q => MATCH.cardWeight[q.position] * (110 - q.hidden.discipline) / 50 * (live.yellow.has(q.id) ? MATCH.bookedCaution : 1));
        if (live.yellow.has(p.id)) { ev(minute, 'yellow', s, p.id); ev(minute, 'red', s, p.id, { secondYellow: true }); remove(s, p); manDown[s]++; }
        else { live.yellow.add(p.id); ev(minute, 'yellow', s, p.id); }
      }
      if (rng.chance(MATCH.straightRedRate / 90) && live.onPitch[s].length) {
        const p = pickWeighted(live.onPitch[s], q => MATCH.cardWeight[q.position] * (110 - q.hidden.discipline) / 50);
        ev(minute, 'red', s, p.id, { secondYellow: false }); remove(s, p); manDown[s]++;
        if (p.position === 'GK') { // keeper sent off: the spare keeper comes on for an outfielder
          const spare = live.bench[s].find(b => b.position === 'GK');
          const out = live.onPitch[s].filter(q => q.position !== 'GK').sort((a, b) => a.hidden.finishing - b.hidden.finishing).pop();
          if (spare && out && live.subsLeft[s] > 0) { live.bench[s] = live.bench[s].filter(b => b !== spare); remove(s, out); live.onPitch[s].push(spare); live.subsLeft[s]--;
            ev(minute, 'sub_off', s, out.id, { reason: 'keeper sent off' }); ev(minute, 'sub_on', s, spare.id); }
        }
      }
    }
  }
  ev(90, 'full_time', 'home', undefined, { home: score.home, away: score.away });
  const result: MatchResult = { fixtureKey, homeId: home.clubId, awayId: away.clubId, homeGoals: score.home, awayGoals: score.away,
    xg: { home: Math.round(xg.home * 100) / 100, away: Math.round(xg.away * 100) / 100 }, events, stats: [], seed, engineVersion: ENGINE_VERSION };
  result.stats = deriveStats(result, [...home.xi, ...home.bench, ...away.xi, ...away.bench], sideOf, new Set([...home.xi, ...away.xi].map(p => p.id)));
  return result;
}

/** Penalty shoot-out (Finals Sunday draws). Not part of fantasy scoring. */
export function shootout(seedKey: string, home: Player[], away: Player[]): { winner: Side; home: number; away: number } {
  const rng = stream(`${seedKey}|shootout`);
  const takers = (ps: Player[]) => ps.filter(p => p.position !== 'GK').sort((a, b) => b.hidden.finishing - a.hidden.finishing);
  const th = takers(home), ta = takers(away);
  let h = 0, a = 0;
  for (let i = 0; i < 5; i++) {
    if (rng.chance(0.65 + th[i % th.length].hidden.finishing / 600)) h++;
    if (rng.chance(0.65 + ta[i % ta.length].hidden.finishing / 600)) a++;
  }
  for (let i = 5; h === a && i < 40; i++) {
    const sh = rng.chance(0.75), sa = rng.chance(0.75);
    h += +sh; a += +sa;
  }
  if (h === a) h++;
  return { winner: h > a ? 'home' : 'away', home: h, away: a };
}

/** Player stats from the event log (the log is the source of truth). */
export function deriveStats(r: MatchResult, squadPlayers: Player[], sideOf: (p: Player) => Side, starters: Set<string>): PlayerMatchStats[] {
  const byId = new Map(squadPlayers.map(p => [p.id, p]));
  const on: Record<string, number> = {}, off: Record<string, number> = {};
  for (const id of starters) on[id] = 0;
  for (const e of r.events) {
    if (e.type === 'sub_on' && e.playerId) on[e.playerId] = e.minute;
    if ((e.type === 'sub_off' || e.type === 'red') && e.playerId) off[e.playerId] = e.minute;
    if (e.type === 'injury' && e.playerId && off[e.playerId] === undefined) off[e.playerId] = e.minute;
  }
  const stats: PlayerMatchStats[] = [];
  for (const id of Object.keys(on)) {
    const p = byId.get(id)!;
    const side = sideOf(p), start = on[id], end = off[id] ?? 90;
    const s: PlayerMatchStats = { playerId: id, side, position: p.position, started: starters.has(id), minutes: Math.max(1, end - start),
      goals: 0, assists: 0, ownGoals: 0, penMisses: 0, penSaves: 0, saves: 0, conceded: 0, yellow: 0, red: 0, cleanSheet: false, injured: false };
    for (const e of r.events) {
      if (e.playerId === id) {
        if (e.type === 'goal') s.goals++;
        else if (e.type === 'assist') s.assists++;
        else if (e.type === 'own_goal') s.ownGoals++;
        else if (e.type === 'pen_miss') s.penMisses++;
        else if (e.type === 'pen_save') s.penSaves++;
        else if (e.type === 'save') s.saves++;
        else if (e.type === 'yellow') s.yellow++;
        else if (e.type === 'red') s.red++;
        else if (e.type === 'injury') s.injured = true;
      }
      // goals against this player's side while he was on (a goal at the minute he came on counts; at the minute he went off, doesn't)
      if (e.type === 'goal' && e.side !== side && e.minute >= start && e.minute < end + (end === 90 ? 1 : 0)) s.conceded++;
    }
    // sent off for two yellows: the red replaces both (−3, as FPL)
    if (r.events.some(e => e.playerId === id && e.type === 'red' && e.detail?.secondYellow)) s.yellow = Math.max(0, s.yellow - 2);
    s.cleanSheet = s.minutes >= 60 && s.conceded === 0;
    stats.push(s);
  }
  return stats;
}
