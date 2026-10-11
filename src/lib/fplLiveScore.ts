// FPL live gameweek scoring: turns a manager's deadline line-up plus the FPL
// live feed into a running score, the way FPL will score it.
//
//   * points per player per fixture from FPL's own `explain` breakdown;
//   * bonus: FPL's figure once it is in the feed (provisional until the
//     fixture is `finished`), otherwise worked out from the fixture's BPS;
//   * automatic substitutions in bench order, keeping a valid formation
//     (1 GK, 3+ DEF, 1+ FWD), only once a starter's matches are over;
//   * captain -> vice-captain when the captain doesn't play; chips; hits;
//   * points still to come from FixtureShark's deadline projections.
//
// Tested against FPL's official totals and automatic subs for 60 real
// manager-gameweeks (src/__tests__/fplLiveScore.test.ts).

export interface LiveStat {
  identifier: string;
  value: number;
  points: number;
}

export interface LiveExplain {
  fixture: number;
  stats: LiveStat[];
}

export interface LivePlayer {
  id: number;
  webName: string;
  team: number;
  /** 1 GK, 2 DEF, 3 MID, 4 FWD */
  type: number;
  minutes: number;
  explain: LiveExplain[];
}

export interface ElementValue {
  element: number;
  value: number;
}

export interface LiveFixture {
  id: number;
  teamH: number;
  teamA: number;
  kickoff: string | null;
  started: boolean;
  finishedProvisional: boolean;
  finished: boolean;
  minutes: number;
  scoreH: number | null;
  scoreA: number | null;
  /** Highest BPS in the fixture (both sides), highest first. Top 8 is enough. */
  bps: ElementValue[];
  /** FPL's bonus once the fixture has ended (provisional until `finished`). */
  bonus: ElementValue[];
}

/** One pick as it stood at the deadline. */
export interface DeadlinePick {
  element: number;
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface FplPickRaw {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface AutoSubRaw {
  element_in: number;
  element_out: number;
}

export type FixtureState = 'not_started' | 'live' | 'done';
export type BonusState = 'none' | 'live' | 'provisional' | 'confirmed';

export interface PlayerFixtureScore {
  fixtureId: number;
  state: FixtureState;
  minutes: number;
  basePoints: number;
  bonus: number;
  bonusState: BonusState;
  stats: LiveStat[];
}

export interface PlayerScore {
  element: number;
  webName: string;
  team: number;
  type: number;
  /** Position at the deadline (1-11 starters, 12-15 bench). */
  deadlinePosition: number;
  /** Position after automatic subs. */
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  /** Effective multiplier now: 0 bench, 1, 2 captain, 3 triple captain. */
  multiplier: number;
  minutes: number;
  /** Points before the multiplier. */
  points: number;
  bonus: number;
  bonusState: BonusState;
  /** All of his fixtures have ended (or he has none this gameweek). */
  done: boolean;
  hasFixture: boolean;
  fixtures: PlayerFixtureScore[];
  subbedIn: boolean;
  subbedOut: boolean;
  /** A starter who hasn't played and may still be replaced. */
  mayBeSubbed: boolean;
  projectedRemaining: number;
}

export interface AutoSub {
  in: number;
  out: number;
  /** True until every match involved is finished, so it could still change. */
  provisional: boolean;
}

export interface LiveTeamScore {
  players: PlayerScore[];
  autoSubs: AutoSub[];
  /** Element wearing the armband now (null if neither captain plays). */
  captain: number | null;
  viceCaptainActive: boolean;
  chip: string | null;
  points: number;
  hits: number;
  net: number;
  projectedRemaining: number;
  projectedFinal: number;
  allDone: boolean;
}

export interface LiveScoreInput {
  picks: DeadlinePick[];
  chip: string | null;
  transferCost: number;
  players: LivePlayer[];
  fixtures: LiveFixture[];
  /** Deadline projection by element then fixture id. */
  projections?: Map<number, Map<number, number>>;
}

const MIN_DEF = 3;
const MIN_FWD = 1;

/**
 * FPL's picks endpoint returns the line-up AFTER automatic subs (positions
 * swapped, multipliers final). Undo the subs, newest first, to get the line-up
 * as it stood at the deadline. The captain flags are not moved by subs.
 */
export function deadlineLineup(picks: FplPickRaw[], autoSubs: AutoSubRaw[] | null | undefined): DeadlinePick[] {
  const pos = new Map<number, number>(picks.map((p) => [p.element, p.position]));
  const subs = [...(autoSubs ?? [])].reverse();
  for (const s of subs) {
    const pin = pos.get(s.element_in);
    const pout = pos.get(s.element_out);
    if (pin === undefined || pout === undefined) continue;
    pos.set(s.element_in, pout);
    pos.set(s.element_out, pin);
  }
  return picks
    .map((p) => ({
      element: p.element,
      position: pos.get(p.element) ?? p.position,
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
    }))
    .sort((a, b) => a.position - b.position);
}

/**
 * Bonus from BPS: 3/2/1 by rank, where rank = 1 + players with more BPS.
 * That reproduces FPL's tie rules: two tied first get 3 each and the next
 * gets 1; two tied second get 2 each and nobody gets 1; ties for third all
 * get 1. `bps` must include every player at least as high as `element`
 * (the top 8 always does for anyone who can score bonus).
 */
export function bonusFromBps(bps: ElementValue[], element: number): number {
  const mine = bps.find((b) => b.element === element);
  if (!mine || mine.value <= 0) return 0;
  const above = bps.filter((b) => b.value > mine.value).length;
  const rank = above + 1;
  return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;
}

export function fixtureState(f: LiveFixture): FixtureState {
  if (f.finishedProvisional || f.finished) return 'done';
  return f.started ? 'live' : 'not_started';
}

function scoreFixture(p: LivePlayer, f: LiveFixture): PlayerFixtureScore {
  const state = fixtureState(f);
  const ex = p.explain.find((e) => e.fixture === f.id);
  const stats = ex?.stats ?? [];
  let base = 0;
  let minutes = 0;
  let explainBonus: number | null = null;
  for (const s of stats) {
    if (s.identifier === 'bonus') {
      explainBonus = (explainBonus ?? 0) + s.points;
      continue;
    }
    base += s.points;
    if (s.identifier === 'minutes') minutes += s.value;
  }
  let bonus = 0;
  let bonusState: BonusState = 'none';
  if (explainBonus !== null) {
    bonus = explainBonus;
    bonusState = f.finished ? 'confirmed' : 'provisional';
  } else if (state === 'done' && f.bonus.length > 0) {
    bonus = f.bonus.find((b) => b.element === p.id)?.value ?? 0;
    bonusState = f.finished ? 'confirmed' : 'provisional';
  } else if (state !== 'not_started') {
    bonus = bonusFromBps(f.bps, p.id);
    bonusState = state === 'done' ? 'provisional' : 'live';
  }
  return { fixtureId: f.id, state, minutes, basePoints: base, bonus, bonusState, stats };
}

function worstBonusState(states: BonusState[]): BonusState {
  if (states.includes('live')) return 'live';
  if (states.includes('provisional')) return 'provisional';
  if (states.includes('confirmed')) return 'confirmed';
  return 'none';
}

function remainingProjection(p: PlayerScore, projections: Map<number, Map<number, number>> | undefined, fixtures: Map<number, LiveFixture>): number {
  if (!projections) return 0;
  const byFixture = projections.get(p.element);
  if (!byFixture) return 0;
  let total = 0;
  for (const pf of p.fixtures) {
    const xp = byFixture.get(pf.fixtureId) ?? 0;
    if (pf.state === 'not_started') total += xp;
    else if (pf.state === 'live') {
      const f = fixtures.get(pf.fixtureId);
      const played = Math.min(90, f?.minutes ?? 0);
      // Most of a player's points (appearance, clean sheet) are already in the
      // live figure once he is on; only the rest of the match is still to come.
      // A player not yet on late in the match is unlikely to add much.
      if (pf.minutes === 0 && played >= 60) continue;
      total += (xp * (90 - played)) / 90;
    }
  }
  return total;
}

export function scoreLiveTeam(input: LiveScoreInput): LiveTeamScore {
  const playerById = new Map(input.players.map((p) => [p.id, p]));
  const fixtureById = new Map(input.fixtures.map((f) => [f.id, f]));
  const chip = input.chip ?? null;
  const benchBoost = chip === 'bboost';
  const captainMultiplier = chip === '3xc' ? 3 : 2;

  const scores: PlayerScore[] = input.picks.map((pick) => {
    const lp = playerById.get(pick.element) ?? {
      id: pick.element,
      webName: String(pick.element),
      team: 0,
      type: 0,
      minutes: 0,
      explain: [],
    };
    const teamFixtures = input.fixtures.filter((f) => f.teamH === lp.team || f.teamA === lp.team);
    // Fall back to the explain's fixtures if the team's aren't in the list.
    const fx = teamFixtures.length > 0
      ? teamFixtures
      : lp.explain.map((e) => fixtureById.get(e.fixture)).filter((f): f is LiveFixture => !!f);
    const fixtures = fx.map((f) => scoreFixture(lp, f));
    const points = fixtures.reduce((s, f) => s + f.basePoints + f.bonus, 0);
    const bonus = fixtures.reduce((s, f) => s + f.bonus, 0);
    const minutes = fixtures.reduce((s, f) => s + f.minutes, 0);
    return {
      element: pick.element,
      webName: lp.webName,
      team: lp.team,
      type: lp.type,
      deadlinePosition: pick.position,
      position: pick.position,
      isCaptain: pick.isCaptain,
      isViceCaptain: pick.isViceCaptain,
      multiplier: 0,
      minutes,
      points,
      bonus,
      bonusState: worstBonusState(fixtures.map((f) => f.bonusState)),
      done: fixtures.every((f) => f.state === 'done'),
      hasFixture: fixtures.length > 0,
      fixtures,
      subbedIn: false,
      subbedOut: false,
      mayBeSubbed: false,
      projectedRemaining: 0,
    };
  });

  const byPos = new Map(scores.map((s) => [s.position, s]));
  const xi = scores.filter((s) => s.position <= 11);
  const bench = scores.filter((s) => s.position > 11).sort((a, b) => a.position - b.position);
  const autoSubs: AutoSub[] = [];

  const played = (s: PlayerScore) => s.minutes > 0;
  const outOfIt = (s: PlayerScore) => s.done && !played(s);

  if (!benchBoost) {
    const lineup = new Set(xi.map((s) => s.element));
    const used = new Set<number>();
    const count = (type: number) => [...lineup].filter((el) => scores.find((s) => s.element === el)!.type === type).length;
    for (let pos = 1; pos <= 11; pos++) {
      const starter = byPos.get(pos);
      if (!starter || played(starter)) continue;
      if (!starter.done) {
        // Only worth flagging once his match is on and he isn't.
        starter.mayBeSubbed = starter.fixtures.some((f) => f.state !== 'not_started');
        continue;
      }
      // Starter is out of it: walk the bench in order.
      const candidates = starter.type === 1
        ? bench.filter((b) => b.type === 1)
        : bench.filter((b) => b.type !== 1);
      for (const b of candidates) {
        if (used.has(b.element)) continue;
        // Formation with b replacing the starter.
        const def = count(2) - (starter.type === 2 ? 1 : 0) + (b.type === 2 ? 1 : 0);
        const fwd = count(4) - (starter.type === 4 ? 1 : 0) + (b.type === 4 ? 1 : 0);
        if (starter.type !== 1 && (def < MIN_DEF || fwd < MIN_FWD)) continue;
        if (played(b)) {
          used.add(b.element);
          lineup.delete(starter.element);
          lineup.add(b.element);
          const benchPos = b.position;
          b.position = starter.position;
          starter.position = benchPos;
          b.subbedIn = true;
          starter.subbedOut = true;
          autoSubs.push({ in: b.element, out: starter.element, provisional: !allFinished(starter, b, fixtureById) });
          break;
        }
        if (!b.done) {
          // He might still come on: FPL keeps bench order, so wait for him.
          starter.mayBeSubbed = true;
          break;
        }
      }
    }
  }

  const counted = (s: PlayerScore) => benchBoost || s.position <= 11;
  const captain = scores.find((s) => s.isCaptain);
  const vice = scores.find((s) => s.isViceCaptain);
  let armband: PlayerScore | null = captain ?? null;
  let viceCaptainActive = false;
  if (captain && outOfIt(captain)) {
    armband = vice && counted(vice) && !outOfIt(vice) ? vice : null;
    viceCaptainActive = armband !== null;
  }

  for (const s of scores) {
    s.multiplier = counted(s) ? (armband && s.element === armband.element ? captainMultiplier : 1) : 0;
  }

  let points = 0;
  let projectedRemaining = 0;
  for (const s of scores) {
    points += s.points * s.multiplier;
    s.projectedRemaining = s.multiplier > 0 ? remainingProjection(s, input.projections, fixtureById) : 0;
    projectedRemaining += s.projectedRemaining * s.multiplier;
  }
  const hits = input.transferCost ?? 0;
  const ordered = [...scores].sort((a, b) => a.position - b.position);
  return {
    players: ordered,
    autoSubs,
    captain: armband?.element ?? null,
    viceCaptainActive,
    chip,
    points,
    hits,
    net: points - hits,
    projectedRemaining,
    projectedFinal: points - hits + projectedRemaining,
    allDone: input.fixtures.length > 0 && input.fixtures.every((f) => f.finished),
  };
}

function allFinished(a: PlayerScore, b: PlayerScore, fixtures: Map<number, LiveFixture>): boolean {
  return [...a.fixtures, ...b.fixtures].every((f) => fixtures.get(f.fixtureId)?.finished ?? true);
}
