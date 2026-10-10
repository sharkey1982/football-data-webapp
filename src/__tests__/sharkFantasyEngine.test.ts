// Shark Fantasy engine (Phase 2): reproducibility, the event log as the
// source of truth, the fixture list, Finals Sunday and the scoring rules.
// The full calibration (1,000 seasons) is scripts/sf/sim-season.ts.
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../sharkfantasy/engine/world';
import { CLUBS, TYPES, TYPE_BY_NAME } from '../sharkfantasy/engine/catalogue';
import { playSeason, roundRobin } from '../sharkfantasy/engine/season';
import { bonusForMatch, fantasyPoints, sharkRating } from '../sharkfantasy/engine/scoring';
import { calibrate } from '../sharkfantasy/engine/calibrate';
import type { PlayerMatchStats } from '../sharkfantasy/engine/types';

const world = generateWorld('test-world');
const season = playSeason(world, 1);

describe('world', () => {
  it('has the ten clubs of the Beat the Shark world, 15 players each (2 GK, 5 DEF, 5 MID, 3 FWD), every player a type', () => {
    expect(world.clubs.map(c => c.name)).toEqual(CLUBS.map(c => c.name));
    for (const c of world.clubs) {
      const sq = world.players.filter(p => p.clubId === c.id);
      expect(sq).toHaveLength(15);
      expect(['GK', 'DEF', 'MID', 'FWD'].map(pos => sq.filter(p => p.position === pos).length)).toEqual([2, 5, 5, 3]);
      expect(new Set(sq.map(p => p.name)).size).toBe(15);                       // no type twice at a club
      for (const p of sq) expect(TYPE_BY_NAME.get(p.name)?.pos).toBe(p.position);
      for (const sig of CLUBS.find(x => x.id === c.id)!.signature) expect(sq.map(p => p.name)).toContain(sig);
    }
    expect(new Set(world.players.map(p => p.id)).size).toBe(150);
  });
  it('star types exist once in the league, at their club', () => {
    for (const t of TYPES.filter(x => x.unique)) {
      const at = world.players.filter(p => p.name === t.name);
      expect(at).toHaveLength(1);
      expect(CLUBS.find(c => c.id === at[0].clubId)!.signature).toContain(t.name);
    }
  });
  it('the Golden Ball Forward is the best finisher in the league', () => {
    const gbf = world.players.find(p => p.name === 'Golden Ball Forward')!;
    expect(Math.max(...world.players.map(p => p.hidden.finishing))).toBe(gbf.hidden.finishing);
  });
});

describe('reproducibility', () => {
  it('the same seed gives an identical season; a different seed does not', () => {
    expect(JSON.stringify(playSeason(generateWorld('test-world'), 1))).toBe(JSON.stringify(season));
    expect(JSON.stringify(playSeason(generateWorld('other-world'), 1))).not.toBe(JSON.stringify(season));
  });
  it('every match records its seed and engine version', () => {
    for (const r of season.results) { expect(r.seed).toContain(r.fixtureKey); expect(r.engineVersion).toMatch(/^sf-engine-/); }
  });
});

describe('fixtures', () => {
  it('round-robin: every pair once, every club once a round, home 4 or 5 times, never 3 home or away in a row', () => {
    const ids = world.clubs.map(c => c.id), fx = roundRobin(ids);
    expect(fx).toHaveLength(45);
    const pairs = new Set(fx.map(f => [f.homeId, f.awayId].sort().join('-')));
    expect(pairs.size).toBe(45);
    for (let r = 1; r <= 9; r++) {
      const inRound = fx.filter(f => f.round === r).flatMap(f => [f.homeId, f.awayId]);
      expect(new Set(inRound).size).toBe(10);
    }
    for (const flip of [false, true]) {
      const f2 = roundRobin(ids, flip);
      for (const id of ids) {
        const h = f2.filter(f => f.homeId === id).length;
        expect(h).toBeGreaterThanOrEqual(4); expect(h).toBeLessThanOrEqual(5);
        const run = f2.filter(f => f.homeId === id || f.awayId === id).sort((a, b) => a.round - b.round).map(f => (f.homeId === id ? 'H' : 'A')).join('');
        expect(run).not.toMatch(/HHH|AAA/);
      }
    }
  });
  it('Finals Sunday pairs 1v2 … 9v10 on the round-9 table; every club plays; the Shield goes to 1st or 2nd', () => {
    expect(season.results).toHaveLength(50);
    const finals = season.results.slice(45), order = season.leagueTable.map(r => r.clubId);
    finals.forEach((r, i) => expect([r.homeId, r.awayId]).toEqual([order[2 * i], order[2 * i + 1]]));
    expect(order.slice(0, 2)).toContain(season.shieldWinner);
    for (const r of finals) if (r.homeGoals === r.awayGoals) expect(r.shootout).toBeDefined();
  });
});

describe('the event log is the record', () => {
  it('player goals + own goals = the score; assists never exceed goals; minutes 1–90; 11 starters a side; at most 5 subs', () => {
    for (const r of season.results) {
      for (const side of ['home', 'away'] as const) {
        const mine = r.stats.filter(s => s.side === side), theirs = r.stats.filter(s => s.side !== side);
        const goals = mine.reduce((a, s) => a + s.goals, 0) + theirs.reduce((a, s) => a + s.ownGoals, 0);
        expect(goals).toBe(side === 'home' ? r.homeGoals : r.awayGoals);
        expect(mine.reduce((a, s) => a + s.assists, 0)).toBeLessThanOrEqual(mine.reduce((a, s) => a + s.goals, 0));
        expect(mine.filter(s => s.started)).toHaveLength(11);
        expect(r.events.filter(e => e.type === 'sub_on' && e.side === side).length).toBeLessThanOrEqual(5);
        for (const s of mine) { expect(s.minutes).toBeGreaterThanOrEqual(1); expect(s.minutes).toBeLessThanOrEqual(90); }
      }
      const ft = r.events.find(e => e.type === 'full_time')!;
      expect([ft.detail!.home, ft.detail!.away]).toEqual([r.homeGoals, r.awayGoals]);
      const seqs = r.events.map(e => e.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }
  });
  it('a clean sheet needs 60+ minutes and nothing conceded while on', () => {
    for (const r of season.results) for (const s of r.stats) expect(s.cleanSheet).toBe(s.minutes >= 60 && s.conceded === 0);
  });
});

const stat = (o: Partial<PlayerMatchStats>): PlayerMatchStats => ({ playerId: 'x', side: 'home', position: 'DEF', started: true, minutes: 90, goals: 0, assists: 0,
  ownGoals: 0, penMisses: 0, penSaves: 0, saves: 0, conceded: 0, yellow: 0, red: 0, cleanSheet: false, injured: false, ...o });

describe('scoring v1', () => {
  it('a defender: 90 minutes, a goal, a clean sheet, a yellow = 2 + 6 + 4 − 1 = 11 (+ bonus)', () => {
    expect(fantasyPoints(stat({ goals: 1, cleanSheet: true, yellow: 1 }), 0).total).toBe(11);
    expect(fantasyPoints(stat({ goals: 1, cleanSheet: true, yellow: 1 }), 3).total).toBe(14);
  });
  it('a keeper: 7 saves, 4 conceded, a penalty save = 2 + 2 − 2 + 5 = 7', () => {
    expect(fantasyPoints(stat({ position: 'GK', saves: 7, conceded: 4, penSaves: 1 }), 0).total).toBe(7);
  });
  it('a forward off the bench for 20 minutes: a goal and an assist = 1 + 4 + 3 = 8; no clean sheet for forwards', () => {
    expect(fantasyPoints(stat({ position: 'FWD', minutes: 20, goals: 1, assists: 1, cleanSheet: false }), 0).total).toBe(8);
    expect(fantasyPoints(stat({ position: 'FWD', cleanSheet: true }), 0).total).toBe(2);
  });
  it('a midfielder: red card, own goal, penalty miss = 2 − 3 − 2 − 2 = −5', () => {
    expect(fantasyPoints(stat({ position: 'MID', red: 1, ownGoals: 1, penMisses: 1 }), 0).total).toBe(-5);
  });
  it('bonus: top three Shark Ratings get 3/2/1; ties share the place (FPL rule)', () => {
    const a = stat({ playerId: 'a', position: 'FWD', goals: 2 }), b = stat({ playerId: 'b', position: 'FWD', goals: 2 }),
      c = stat({ playerId: 'c', position: 'MID', goals: 1 }), d = stat({ playerId: 'd', position: 'MID' });
    expect(sharkRating(a)).toBe(sharkRating(b));
    expect(bonusForMatch([a, b, c, d])).toEqual({ a: 3, b: 3, c: 1 });
  });
});

describe('calibration (quick)', () => {
  it('goals, home wins and clean sheets in the right range over 60 seasons', () => {
    const c = calibrate(6, 10, 'unit');
    expect(c.measures.goalsPerMatch).toBeGreaterThan(2.7);
    expect(c.measures.goalsPerMatch).toBeLessThan(3.2);
    expect(c.measures.homeWin).toBeGreaterThan(0.38);
    expect(c.measures.homeWin).toBeLessThan(0.5);
    expect(c.measures.cleanSheetPerTeam).toBeGreaterThan(0.19);
  });
});
