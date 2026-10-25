import { describe, expect, it } from 'vitest';
import {
  bonusFromBps,
  deadlineLineup,
  scoreLiveTeam,
  type ElementValue,
  type FplPickRaw,
  type LiveFixture,
  type LivePlayer,
} from '../lib/fplLiveScore';
import { CAPTURED_ENTRIES } from './fixtures/fplLivePicks';
import { FIXTURE_BONUS, LIVE, TYPES } from './fixtures/fplLiveFeed';

const types = new Map(TYPES.split(',').map((t) => t.split(':').map(Number) as [number, number]));

function parseLive(ev: number): LivePlayer[] {
  return LIVE[ev].split(';').map((row) => {
    const [id, minutes, ex] = row.split('|');
    const explain = ex
      ? ex.split('#').map((fx) => {
          const [fixture, stats] = fx.split(':');
          return {
            fixture: Number(fixture),
            stats: stats.split(',').map((s) => {
              const [identifier, vp] = s.split('=');
              const [value, points] = vp.split('/').map(Number);
              return { identifier, value, points };
            }),
          };
        })
      : [];
    // Team unknown in the capture: 0 matches no fixture, so the scorer uses
    // the explain's fixtures.
    return { id: Number(id), webName: id, team: 0, type: types.get(Number(id)) ?? 0, minutes: Number(minutes), explain };
  });
}

function parsePairs(s: string): ElementValue[] {
  return s ? s.split(',').map((p) => { const [element, value] = p.split('=').map(Number); return { element, value }; }) : [];
}

function parseFixtures(ev: number, finished = true): LiveFixture[] {
  return FIXTURE_BONUS[ev].split(';').map((row) => {
    const [id, bps, bonus] = row.split('|');
    return {
      id: Number(id), teamH: -1, teamA: -2, kickoff: null, started: true, finishedProvisional: true, finished,
      minutes: 90, scoreH: 0, scoreA: 0, bps: parsePairs(bps), bonus: parsePairs(bonus),
    };
  });
}

function parsePicks(s: string): FplPickRaw[] {
  return s.split(';').map((p) => {
    const [element, position, multiplier, c, v] = p.split(',').map(Number);
    return { element, position, multiplier, is_captain: c === 1, is_vice_captain: v === 1 };
  });
}

function parseSubs(s: string | null) {
  return s ? s.split(';').map((x) => { const [element_in, element_out] = x.split('>').map(Number); return { element_in, element_out }; }) : [];
}

describe('scoreLiveTeam against FPL official gameweek totals', () => {
  const live = { 4: parseLive(4), 5: parseLive(5) } as Record<number, LivePlayer[]>;
  const fixtures = { 4: parseFixtures(4), 5: parseFixtures(5) } as Record<number, LiveFixture[]>;

  it('has a varied sample (chips, hits, auto-subs, a benched captain)', () => {
    const chips = new Set(CAPTURED_ENTRIES.map((e) => e.chip));
    expect(chips).toEqual(new Set([null, 'freehit', 'wildcard', '3xc', 'bboost']));
    expect(CAPTURED_ENTRIES.filter((e) => e.subs).length).toBeGreaterThan(20);
    expect(CAPTURED_ENTRIES.some((e) => e.subs?.includes(';'))).toBe(true);
  });

  for (const e of CAPTURED_ENTRIES) {
    it(`GW${e.ev} entry ${e.entry}: ${e.pts} pts${e.subs ? `, subs ${e.subs}` : ''}${e.chip ? `, ${e.chip}` : ''}`, () => {
      const raw = parsePicks(e.picks);
      const subs = parseSubs(e.subs);
      const picks = deadlineLineup(raw, subs);
      const res = scoreLiveTeam({ picks, chip: e.chip, transferCost: e.hit, players: live[e.ev], fixtures: fixtures[e.ev] });
      expect(res.points).toBe(e.pts);
      expect(res.hits).toBe(e.hit);
      expect(res.autoSubs.map((s) => `${s.in}>${s.out}`).join(';') || null).toBe(e.subs);
      expect(res.autoSubs.every((s) => !s.provisional)).toBe(true);
      // Final multipliers match FPL's post-sub picks.
      const fplMult = new Map(raw.map((p) => [p.element, p.multiplier]));
      for (const p of res.players) expect(p.multiplier, `element ${p.element}`).toBe(fplMult.get(p.element));
      expect(res.allDone).toBe(true);
    });
  }
});

describe('bonusFromBps', () => {
  const pairs = (s: string) => parsePairs(s);
  it('applies FPL tie rules (checked against every GW4-5 fixture)', () => {
    for (const ev of [4, 5]) {
      for (const f of parseFixtures(ev)) {
        const computed = f.bps.map((b) => ({ element: b.element, value: bonusFromBps(f.bps, b.element) })).filter((b) => b.value > 0);
        const key = (x: ElementValue[]) => x.map((b) => `${b.element}=${b.value}`).sort().join(',');
        expect(key(computed), `fixture ${f.id}`).toBe(key(f.bonus));
      }
    }
  });
  it('tie for first: both 3, next 1', () => {
    const bps = pairs('1=36,2=36,3=34,4=29');
    expect([1, 2, 3, 4].map((el) => bonusFromBps(bps, el))).toEqual([3, 3, 1, 0]);
  });
  it('tie for second: both 2, nobody 1', () => {
    const bps = pairs('1=36,2=29,3=29,4=27');
    expect([1, 2, 3, 4].map((el) => bonusFromBps(bps, el))).toEqual([3, 2, 2, 0]);
  });
  it('three tied first: all 3, nobody else', () => {
    const bps = pairs('1=30,2=30,3=30,4=20');
    expect([1, 2, 3, 4].map((el) => bonusFromBps(bps, el))).toEqual([3, 3, 3, 0]);
  });
  it('tie for third: all 1', () => {
    const bps = pairs('1=30,2=25,3=20,4=20');
    expect([1, 2, 3, 4].map((el) => bonusFromBps(bps, el))).toEqual([3, 2, 1, 1]);
  });
  it('outside the list or no BPS: 0', () => {
    expect(bonusFromBps(pairs('1=30,2=25,3=20'), 9)).toBe(0);
    expect(bonusFromBps(pairs('1=0'), 1)).toBe(0);
  });
});

// ---- Synthetic live situations ----------------------------------------

function fx(id: number, teamH: number, teamA: number, state: 'ns' | 'live' | 'ft' | 'done', minutes = 90, bps = '', bonus = ''): LiveFixture {
  return {
    id, teamH, teamA, kickoff: null,
    started: state !== 'ns',
    finishedProvisional: state === 'ft' || state === 'done',
    finished: state === 'done',
    minutes: state === 'ns' ? 0 : minutes,
    scoreH: 0, scoreA: 0, bps: parsePairs(bps), bonus: parsePairs(bonus),
  };
}

function pl(id: number, type: number, team: number, fixture: number | null, minutes: number, extra: string = ''): LivePlayer {
  const stats = [{ identifier: 'minutes', value: minutes, points: minutes === 0 ? 0 : minutes >= 60 ? 2 : 1 }];
  for (const s of extra ? extra.split(',') : []) {
    const [identifier, vp] = s.split('=');
    const [value, points] = vp.split('/').map(Number);
    stats.push({ identifier, value, points });
  }
  return { id, webName: `P${id}`, team, type, minutes, explain: fixture === null ? [] : [{ fixture, stats }] };
}

// Squad: GK 1, DEF 2-5, MID 6-9, FWD 10-11 (3-4-... wait 4-4-2), bench GK 12, then 13 DEF, 14 MID, 15 FWD.
// Each player id = position; team = id so each has their own fixture id = id.
function squad(opts: { minutes?: Record<number, number>; state?: Record<number, 'ns' | 'live' | 'ft' | 'done'>; captain?: number; vice?: number; types?: Record<number, number> } = {}) {
  const typeOf = (i: number) => opts.types?.[i] ?? (i === 1 || i === 12 ? 1 : i <= 5 || i === 13 ? 2 : i <= 9 || i === 14 ? 3 : 4);
  const players: LivePlayer[] = [];
  const fixtures: LiveFixture[] = [];
  for (let i = 1; i <= 15; i++) {
    const st = opts.state?.[i] ?? 'done';
    const m = opts.minutes?.[i] ?? 90;
    fixtures.push(fx(i, i, 100 + i, st));
    players.push(pl(i, typeOf(i), i, st === 'ns' ? null : i, st === 'ns' ? 0 : m));
  }
  const captain = opts.captain ?? 10;
  const vice = opts.vice ?? 6;
  const picks = Array.from({ length: 15 }, (_, k) => ({ element: k + 1, position: k + 1, isCaptain: k + 1 === captain, isViceCaptain: k + 1 === vice }));
  return { picks, players, fixtures };
}

describe('scoreLiveTeam live behaviour', () => {
  it('everyone plays 90: 11 x 2 + captain 2 = 24', () => {
    const s = squad();
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 4 });
    expect(r.points).toBe(24);
    expect(r.net).toBe(20);
    expect(r.autoSubs).toEqual([]);
  });

  it('does not sub a starter whose match has not finished', () => {
    const s = squad({ minutes: { 7: 0 }, state: { 7: 'live' } });
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.autoSubs).toEqual([]);
    expect(r.players.find((p) => p.element === 7)!.mayBeSubbed).toBe(true);
  });

  it('subs the first bench outfielder who played', () => {
    const s = squad({ minutes: { 7: 0, 13: 0 } });
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.autoSubs.map((a) => [a.in, a.out])).toEqual([[14, 7]]);
    expect(r.points).toBe(24);
  });

  it('waits when the next bench player has not played yet', () => {
    const s = squad({ minutes: { 7: 0 }, state: { 13: 'ns' } });
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.autoSubs).toEqual([]);
    expect(r.players.find((p) => p.element === 7)!.mayBeSubbed).toBe(true);
  });

  it('a sub made before the matches are finished is provisional', () => {
    const s = squad({ minutes: { 7: 0 }, state: { 7: 'ft', 13: 'ft' } });
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.autoSubs).toEqual([{ in: 13, out: 7, provisional: true }]);
  });

  it('keeps 3 defenders: a DEF can only be replaced by a DEF when at the minimum', () => {
    // 3-5-2: DEF 2-4, MID 5-9, FWD 10-11.
    const types = { 5: 3 };
    const s = squad({ types, minutes: { 2: 0 } });
    // Bench: 13 DEF played -> must be him even though... 13 is first anyway; make 13 not play.
    const s2 = squad({ types, minutes: { 2: 0, 13: 0 } });
    expect(scoreLiveTeam({ ...s, chip: null, transferCost: 0 }).autoSubs.map((a) => a.in)).toEqual([13]);
    // 13 didn't play; 14 (MID) would leave 2 DEF -> skip; 15 (FWD) too -> no sub.
    const r2 = scoreLiveTeam({ ...s2, chip: null, transferCost: 0 });
    expect(r2.autoSubs).toEqual([]);
  });

  it('a goalkeeper is only replaced by the bench goalkeeper', () => {
    const s = squad({ minutes: { 1: 0 } });
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.autoSubs.map((a) => [a.in, a.out])).toEqual([[12, 1]]);
    const s2 = squad({ minutes: { 1: 0, 12: 0 } });
    expect(scoreLiveTeam({ ...s2, chip: null, transferCost: 0 }).autoSubs).toEqual([]);
  });

  it('captain does not play: vice gets the armband, x3 with triple captain', () => {
    const s = squad({ minutes: { 10: 0, 13: 0, 14: 0, 15: 0 } });
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.captain).toBe(6);
    expect(r.viceCaptainActive).toBe(true);
    expect(r.points).toBe(10 * 2 + 2);
    const r3 = scoreLiveTeam({ ...s, chip: '3xc', transferCost: 0 });
    expect(r3.points).toBe(10 * 2 + 4);
  });

  it('captain yet to play keeps the armband, and is not flagged as a possible sub', () => {
    const s = squad({ state: { 10: 'ns' } });
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.captain).toBe(10);
    expect(r.players.find((p) => p.element === 10)!.mayBeSubbed).toBe(false);
    expect(r.points).toBe(10 * 2);
  });

  it('bench boost counts all 15 and makes no subs', () => {
    const s = squad({ minutes: { 7: 0 } });
    const r = scoreLiveTeam({ ...s, chip: 'bboost', transferCost: 0 });
    expect(r.autoSubs).toEqual([]);
    expect(r.points).toBe(14 * 2 + 2);
  });

  it('a blank-gameweek starter is replaced once the bench player has played', () => {
    const s = squad();
    s.fixtures = s.fixtures.filter((f) => f.id !== 8);
    s.players = s.players.map((p) => (p.id === 8 ? { ...p, explain: [], minutes: 0 } : p));
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.autoSubs.map((a) => [a.in, a.out])).toEqual([[13, 8]]);
  });

  it('double gameweek: points from both fixtures', () => {
    const s = squad();
    s.fixtures.push(fx(99, 6, 200, 'done'));
    s.players = s.players.map((p) => (p.id === 6 ? { ...p, minutes: 180, explain: [...p.explain, { fixture: 99, stats: [{ identifier: 'minutes', value: 90, points: 2 }, { identifier: 'goals_scored', value: 1, points: 5 }] }] } : p));
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    expect(r.players.find((p) => p.element === 6)!.points).toBe(9);
    expect(r.points).toBe(24 + 7);
  });

  it('live bonus from BPS, then FPL bonus once the match ends, without double counting', () => {
    const s = squad({ state: { 10: 'live' } });
    s.fixtures = s.fixtures.map((f) => (f.id === 10 ? { ...f, bps: parsePairs('10=40,500=30,501=20') } : f));
    const live = scoreLiveTeam({ ...s, chip: null, transferCost: 0 });
    const cap = live.players.find((p) => p.element === 10)!;
    expect(cap.bonus).toBe(3);
    expect(cap.bonusState).toBe('live');
    expect(live.points).toBe(24 + 6);
    // After full time FPL adds bonus to the explain and the fixture.
    const s2 = squad({ state: { 10: 'ft' } });
    s2.fixtures = s2.fixtures.map((f) => (f.id === 10 ? { ...f, bps: parsePairs('10=40,500=30,501=20'), bonus: parsePairs('10=3,500=2,501=1') } : f));
    s2.players = s2.players.map((p) => (p.id === 10 ? { ...p, explain: [{ fixture: 10, stats: [...p.explain[0].stats, { identifier: 'bonus', value: 3, points: 3 }] }] } : p));
    const ft = scoreLiveTeam({ ...s2, chip: null, transferCost: 0 });
    expect(ft.players.find((p) => p.element === 10)!.bonusState).toBe('provisional');
    expect(ft.points).toBe(24 + 6);
  });

  it('projected remaining: unplayed fixtures count in full, live ones pro rata, bench excluded', () => {
    const s = squad({ minutes: { 7: 45 }, state: { 6: 'ns', 7: 'live', 13: 'ns' } });
    s.fixtures = s.fixtures.map((f) => (f.id === 7 ? { ...f, minutes: 45 } : f));
    const projections = new Map([[6, new Map([[6, 5]])], [7, new Map([[7, 4]])], [13, new Map([[13, 3]])]]);
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0, projections });
    // Player 7, on for 45 of 45: (4 - 2 appearance) x 45/90 = 1, plus the second appearance point at 60.
    expect(r.projectedRemaining).toBeCloseTo(5 + 2);
    expect(r.projectedFinal).toBeCloseTo(r.net + 7);
  });

  it('projected remaining does not re-add appearance points for a player already past 60 minutes', () => {
    const s = squad({ minutes: { 7: 70 }, state: { 7: 'live' } });
    s.fixtures = s.fixtures.map((f) => (f.id === 7 ? { ...f, minutes: 70 } : f));
    const projections = new Map([[7, new Map([[7, 6]])]]);
    const r = scoreLiveTeam({ ...s, chip: null, transferCost: 0, projections });
    // (6 - 2) x 20/90, no appearance point left to earn (it was 6 x 20/90 = 1.33 before).
    expect(r.projectedRemaining).toBeCloseTo((4 * 20) / 90);
  });
});

describe('deadlineLineup', () => {
  it('reverses FPL automatic subs to the deadline positions', () => {
    const raw: FplPickRaw[] = [
      { element: 1, position: 1, multiplier: 1, is_captain: false, is_vice_captain: false },
      { element: 50, position: 5, multiplier: 1, is_captain: false, is_vice_captain: false },
      { element: 70, position: 13, multiplier: 0, is_captain: true, is_vice_captain: false },
    ];
    const d = deadlineLineup(raw, [{ element_in: 50, element_out: 70 }]);
    expect(d.find((p) => p.element === 70)!.position).toBe(5);
    expect(d.find((p) => p.element === 50)!.position).toBe(13);
  });
});
