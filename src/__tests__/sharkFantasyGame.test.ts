// @vitest-environment node
// Shark Fantasy game logic (Phase 3a): squads, lineups, auto-subs, captaincy,
// transfers, prices, the public view, the projection and the bots.
// The full bot test (100+ seasons) is scripts/sf/bots.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import highsLoader from 'highs';
import { generateWorld } from '../sharkfantasy/engine/world';
import { startSeason, playRound } from '../sharkfantasy/engine/season';
import type { Position } from '../sharkfantasy/engine/types';
import { GAME_RULES_V1 as R } from '../sharkfantasy/fantasy/rules';
import { squadProblems, lineupProblems, autoSubs, roundScore } from '../sharkfantasy/fantasy/squad';
import type { Entry, PlayerInfo, Selection } from '../sharkfantasy/fantasy/squad';
import { initialPrices, formPriceChange, sellingPrice, transfer, applyTransfers, hitCost, closeTransferWindow } from '../sharkfantasy/fantasy/market';
import { publicView } from '../sharkfantasy/fantasy/publicview';
import { projectRounds } from '../sharkfantasy/fantasy/projection';
import { runLeague } from '../sharkfantasy/fantasy/league';
import type { Solver } from '../sharkfantasy/fantasy/bots';

const world = generateWorld('game-test');
const infoMap = new Map<string, PlayerInfo>(world.players.map(p => [p.id, { id: p.id, clubId: p.clubId, position: p.position }]));
const info = (id: string) => infoMap.get(id)!;
const flat = (n: number) => () => n;

/** A legal squad: per position, players from clubs in turn (never more than 2 a club). */
function makeSquad(): string[] {
  const out: string[] = [];
  let c = 0;
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) for (let k = 0; k < R.squadMin[pos]; k++) {
    const club = world.clubs[c++ % 10].id;
    out.push(world.players.find(p => p.clubId === club && p.position === pos && !out.includes(p.id))!.id);
  }
  return out;
}
const squad = makeSquad();
const byPos = (pos: Position) => squad.filter(id => info(id).position === pos);
// 4-4-2: GK, DEF×4, MID×4, FWD×2; bench: GK2, DEF5, MID5, FWD3
const sel: Selection = {
  xi: [byPos('GK')[0], ...byPos('DEF').slice(0, 4), ...byPos('MID').slice(0, 4), ...byPos('FWD').slice(0, 2)],
  bench: [byPos('GK')[1], byPos('DEF')[4], byPos('MID')[4], byPos('FWD')[2]],
  captain: byPos('FWD')[0], vice: byPos('MID')[0],
};
const picks = (price = 60) => squad.map(id => ({ playerId: id, purchasePrice: price }));
const entry = (): Entry => ({ id: 'e', picks: picks(), selection: { ...sel, xi: sel.xi.slice(), bench: sel.bench.slice() }, bank: 100, freeTransfers: 1, wildcardsLeft: 1, transfersThisRound: 0, wildcardThisRound: false, pointsByRound: [], hitsByRound: [] });

describe('squads and lineups', () => {
  it('a legal squad and 4-4-2 pass', () => {
    expect(squadProblems(picks(), info, flat(60))).toEqual([]);
    expect(lineupProblems(sel, picks(), info)).toEqual([]);
  });
  it('over budget, a fourth player from a club, and the wrong shape fail', () => {
    expect(squadProblems(picks(), info, flat(70)).join()).toMatch(/budget/);
    const club = info(squad[0]).clubId;
    const extra = world.players.filter(p => p.clubId === club && p.position === 'MID').slice(0, 3).map(p => p.id);
    const four = squad.filter(id => info(id).position !== 'MID').concat(extra, byPos('MID').filter(id => info(id).clubId !== club).slice(0, 2));
    expect(squadProblems(four.map(id => ({ playerId: id, purchasePrice: 50 })), info, flat(50)).join()).toMatch(/max 3/);
    expect(squadProblems(picks().slice(1), info, flat(50)).join()).toMatch(/14 players/);
  });
  it('lineup rules: 5-3-2 is fine; the reserve keeper must be first on the bench; the captain must start', () => {
    const six = { ...sel, xi: sel.xi.filter(id => id !== byPos('MID')[3]).concat(byPos('DEF')[4]), bench: [byPos('GK')[1], byPos('MID')[3], byPos('MID')[4], byPos('FWD')[2]] };
    expect(lineupProblems(six, picks(), info)).toEqual([]);           // 5-3-2
    const bad = { ...sel, bench: [sel.bench[1], sel.bench[0], ...sel.bench.slice(2)] };
    expect(lineupProblems(bad, picks(), info).join()).toMatch(/reserve keeper/);
    expect(lineupProblems({ ...sel, captain: sel.bench[1] }, picks(), info).join()).toMatch(/captain/);
  });
});

describe('auto-subs and the captain', () => {
  const played = (absent: string[]) => (id: string) => (absent.includes(id) ? 0 : 90);
  it('a starter with no minutes is replaced by the first bench player who played', () => {
    const out = sel.xi[6];                                        // a MID
    const r = autoSubs(sel, played([out]), info);
    expect(r.subs).toEqual([[out, sel.bench[1]]]);                // the first outfield sub (DEF): 5-3-2 is legal
  });
  it('the keeper only by the reserve keeper', () => {
    const r = autoSubs(sel, played([sel.xi[0]]), info);
    expect(r.subs).toEqual([[sel.xi[0], sel.bench[0]]]);
    const none = autoSubs(sel, played([sel.xi[0], sel.bench[0]]), info);
    expect(none.subs).toEqual([]);
  });
  it('skips a bench player who would break the formation', () => {
    // 3-5-2 with one DEF absent: a MID can't come on (2 DEF), the DEF on the bench can
    const s352: Selection = { xi: [byPos('GK')[0], ...byPos('DEF').slice(0, 3), ...byPos('MID'), ...byPos('FWD').slice(0, 2)],
      bench: [byPos('GK')[1], byPos('FWD')[2], byPos('DEF')[3], byPos('DEF')[4]], captain: byPos('FWD')[0], vice: byPos('MID')[0] };
    expect(lineupProblems(s352, picks(), info)).toEqual([]);
    const r = autoSubs(s352, played([byPos('DEF')[0]]), info);
    expect(r.subs).toEqual([[byPos('DEF')[0], byPos('DEF')[3]]]);
  });
  it('captain doubles; the vice doubles if the captain did not play', () => {
    const pts = (id: string) => (id === sel.captain ? 10 : id === sel.vice ? 6 : 2);
    expect(roundScore(sel, pts, flat(90), info).total).toBe(9 * 2 + 6 + 10 * 2);
    const r = roundScore(sel, pts, (id) => (id === sel.captain ? 0 : 90), info);
    expect(r.captainUsed).toBe(sel.vice);
    // captain's place goes to the first bench player who keeps the shape (FWD 3 on the bench at the end: DEF first, 5-4-1 is legal)
    expect(r.total).toBe(9 * 2 + 6 * 2 + 2);
  });
});

describe('transfers and prices', () => {
  it('selling price keeps half of any rise, all of a fall', () => {
    expect(sellingPrice(50, 53)).toBe(51);
    expect(sellingPrice(50, 54)).toBe(52);
    expect(sellingPrice(50, 47)).toBe(47);
  });
  it('a like-for-like transfer updates the squad, bank and selection', () => {
    const e = entry(), out = sel.captain;
    const inn = world.players.find(p => p.position === 'FWD' && !squad.includes(p.id) && info(p.id).clubId !== info(byPos('FWD')[1]).clubId)!.id;
    expect(transfer(e, out, byPos('MID')[0], flat(60), info).join()).toMatch(/already|like for like/);
    expect(transfer(e, out, inn, (id) => (id === inn ? 65 : 60), info)).toEqual([]);
    expect(e.bank).toBe(95);
    expect(e.selection.captain).toBe(inn);
    expect(e.transfersThisRound).toBe(1);
  });
  it('several transfers at once are judged on the final squad', () => {
    const e = entry();
    const outs = [byPos('MID')[0], byPos('MID')[1]];
    const ins = world.players.filter(p => p.position === 'MID' && !squad.includes(p.id)).slice(0, 2).map(p => p.id);
    const price = (id: string) => (id === ins[0] ? 200 : 60);
    expect(applyTransfers(e, outs, ins, price, info).join()).toMatch(/overspent/);
    expect(e.transfersThisRound).toBe(0);
  });
  it('hits: −4 per transfer beyond the free ones; free transfers bank up to 3; a wildcard is free', () => {
    const e = entry();
    e.transfersThisRound = 3; e.freeTransfers = 1;
    expect(hitCost(e)).toBe(8);
    expect(closeTransferWindow(e)).toBe(8);
    expect(e.freeTransfers).toBe(1);
    for (let k = 0; k < 4; k++) closeTransferWindow(e);
    expect(e.freeTransfers).toBe(3);
    e.transfersThisRound = 5; e.wildcardThisRound = true;
    expect(closeTransferWindow(e)).toBe(0);
    expect(e.freeTransfers).toBe(3);
  });
  it('initial prices sit in each band and rise with the projection', () => {
    const ps = world.players.map((p, i) => ({ ...info(p.id), xp: i % 37 }));
    const pr = initialPrices(ps);
    for (const p of ps) { const [lo, hi] = R.priceBand[p.position]; expect(pr[p.id]).toBeGreaterThanOrEqual(lo); expect(pr[p.id]).toBeLessThanOrEqual(hi); }
    const mids = ps.filter(p => p.position === 'MID').sort((a, b) => a.xp - b.xp);
    expect(pr[mids[0].id]).toBeLessThanOrEqual(pr[mids[mids.length - 1].id]);
  });
  it('form moves a price at most 0.2 a week and 0.6 a season, never below the band', () => {
    expect(formPriceChange(60, 60, 3, [15, 15, 15], 'MID')).toBe(62);
    expect(formPriceChange(66, 60, 3, [15, 15, 15], 'MID')).toBe(66);
    expect(formPriceChange(60, 60, 6, [0, 0, 0], 'MID')).toBe(58);
    expect(formPriceChange(45, 45, 3, [0, 0, 0], 'MID')).toBe(45);
    expect(formPriceChange(60, 60, 3, [3, 4, 2], 'MID')).toBe(60);
  });
});

describe('the public view and the projection', () => {
  const ss = startSeason(world, 1);
  for (let r = 0; r < 3; r++) playRound(ss);
  const pv = publicView(ss);
  it('never carries hidden attributes; scouting is close but not exact', () => {
    const json = JSON.stringify(pv);
    for (const key of ['hidden', 'finishing', 'goalkeeping', 'injuryProneness', 'potential', 'fitness']) expect(json).not.toContain(`"${key}"`);
    const diffs = world.players.map(p => Math.abs(pv.players.find(x => x.id === p.id)!.scout.attack - p.hidden.finishing));
    expect(diffs.some(d => d > 0)).toBe(true);
    expect(diffs.reduce((a, b) => a + b, 0) / diffs.length).toBeLessThan(8);
  });
  it('shows played rounds and the fixtures still to come', () => {
    expect(pv.nextRound).toBe(4);
    expect(pv.results).toHaveLength(15);
    expect(pv.fixtures.filter(f => f.round === 4)).toHaveLength(5);
    expect(pv.fixtures.some(f => f.round === 10)).toBe(false);   // Finals Sunday is set by the table
  });
  it('projects every player for the next round, sensibly', () => {
    const rows = projectRounds(pv, [4]);
    expect(rows).toHaveLength(150);
    for (const x of rows) { expect(x.xPoints).toBeGreaterThanOrEqual(-1); expect(x.xPoints).toBeLessThan(10); expect(x.pStart).toBeLessThanOrEqual(1); }
    const unavailable = pv.players.filter(p => p.availableFrom > 4).map(p => p.id);
    for (const id of unavailable) expect(rows.find(x => x.playerId === id)!.xPoints).toBe(0);
  });
});

describe('a bot league', () => {
  const lineup = { optimiser: 2, template: 1, setforget: 1, chaser: 1, random: 2 };
  let solve: Solver;
  let a: ReturnType<typeof runLeague>;
  beforeAll(async () => {
    const highs = await highsLoader();
    solve = (lp) => highs.solve(lp) as unknown as ReturnType<Solver>;
    a = runLeague('league-test', lineup, solve);
  }, 120_000);
  it('every bot keeps a legal squad and lineup all season (runLeague checks each round)', () => {
    expect(a.bots).toHaveLength(7);
    for (const b of a.bots) expect(b.byRound).toHaveLength(10);
  });
  it('is reproducible', () => {
    expect(JSON.stringify(runLeague('league-test', lineup, solve))).toBe(JSON.stringify(a));
  }, 120_000);
  it('the projection is honest on average (within 15% of actual points)', () => {
    const xp = a.projections.reduce((s, r) => s + r.xp, 0), act = a.projections.reduce((s, r) => s + r.actual, 0);
    expect(Math.abs(xp / act - 1)).toBeLessThan(0.15);
  });
});

describe('the round runner', () => {
  it('canonical JSON sorts keys and drops undefined, so a state read back from jsonb hashes the same', async () => {
    const { canonical } = await import('../sharkfantasy/runner');
    expect(canonical({ b: 1, a: { d: [1, { y: 2, x: undefined, w: 'z' }], c: null } })).toBe('{"a":{"c":null,"d":[1,{"w":"z","y":2}]},"b":1}');
    expect(canonical(JSON.parse(JSON.stringify({ z: 0.1 + 0.2, a: -0 })))).toBe(canonical({ a: 0, z: 0.30000000000000004 }));
  });
  it('creates a season: public tables carry no hidden attributes; the hidden ones go only to the world and player_hidden', async () => {
    const { createSeason } = await import('../sharkfantasy/runner');
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    await createSeason({ rpc: async (fn, args) => { calls.push({ fn, args }); return 7; }, hash: s => String(s.length) },
      { universe: 'u', name: 'U', seed: 'runner-test', firstDeadline: new Date('2026-10-18T11:00:00Z'), spacingMinutes: 10080, kickoffAfterMinutes: 180 });
    expect(calls.map(c => c.fn)).toEqual(['sf_create_season']);
    const p = calls[0].args.p as Record<string, unknown>;
    for (const k of ['players', 'clubs', 'scouting', 'prices', 'projections', 'fixtures']) expect(JSON.stringify(p[k])).not.toMatch(/"(hidden|finishing|goalkeeping|injuryProneness|potential)"/);
    expect((p.fixtures as unknown[]).length).toBe(45);
    expect((p.rounds as { deadline_at: string; kickoff_at: string }[])[1]).toEqual({ number: 2, kind: 'league', deadline_at: '2026-10-25T11:00:00.000Z', kickoff_at: '2026-10-25T14:00:00.000Z' });
    expect((p.snapshot as { state: Record<string, unknown> }).state.world).toBeUndefined();
  });
});

describe('weekly deadlines in UK time', () => {
  it('12:00 stays 12:00 across the end of British Summer Time; kick-off three hours later', async () => {
    const { createSeason, zoneOffset } = await import('../sharkfantasy/runner');
    expect(zoneOffset(Date.parse('2026-07-01T12:00:00Z'), 'Europe/London')).toBe(3_600_000);
    expect(zoneOffset(Date.parse('2026-12-01T12:00:00Z'), 'Europe/London')).toBe(0);
    let p: { rounds: { deadline_at: string; kickoff_at: string }[] } = { rounds: [] };
    await createSeason({ rpc: async (_f, a) => { p = a.p as typeof p; return 1; }, hash: () => '' },
      { universe: 'u', name: 'U', seed: 'tz', firstDeadline: new Date('2026-10-18T11:00:00Z'), spacingMinutes: 10080, kickoffAfterMinutes: 180, zone: 'Europe/London' });
    expect(p.rounds.slice(0, 3).map(r => r.deadline_at)).toEqual(['2026-10-18T11:00:00.000Z', '2026-10-25T12:00:00.000Z', '2026-11-01T12:00:00.000Z']);
    expect(p.rounds[1].kickoff_at).toBe('2026-10-25T15:00:00.000Z');
  });
});

describe('rules v2 (the Beat the Shark world)', () => {
  it('XI plus one sub: 12 players, positions within limits, any position on the bench, a valid XI possible', async () => {
    const { GAME_RULES_V2: R2, GAME_RULES_V2_NOSUB: RN } = await import('../sharkfantasy/fantasy/rules');
    const { hasValidXi } = await import('../sharkfantasy/fantasy/squad');
    const xi = [byPos('GK')[0], ...byPos('DEF').slice(0, 4), ...byPos('MID').slice(0, 4), ...byPos('FWD').slice(0, 2)];
    const twelve = [...xi, byPos('MID')[4]];
    const p12 = twelve.map(id => ({ playerId: id, purchasePrice: 60 }));
    expect(squadProblems(p12, info, flat(60), R2)).toEqual([]);
    const sel12: Selection = { xi, bench: [byPos('MID')[4]], captain: xi[10], vice: xi[9] };
    expect(lineupProblems(sel12, p12, info, R2)).toEqual([]);          // no reserve keeper needed
    expect(squadProblems(p12.slice(0, 11), info, flat(60), R2).join()).toMatch(/11 players, not 12/);
    // eleven, all play: the same XI is a whole squad
    const p11 = xi.map(id => ({ playerId: id, purchasePrice: 60 }));
    expect(squadProblems(p11, info, flat(60), RN)).toEqual([]);
    expect(lineupProblems({ ...sel12, bench: [] }, p11, info, RN)).toEqual([]);
    // two keepers and nine outfielders that can't make a formation
    expect(hasValidXi(['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD'], R2)).toBe(false);
    expect(hasValidXi(['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'], R2)).toBe(true);
    // budget
    expect(squadProblems(p12, info, flat(80), R2).join()).toMatch(/budget/);   // 12 × 8.0 = 96.0 > 90.0
  });
  it('prices on one points scale: a better projection costs more, whatever the position', async () => {
    const { GAME_RULES_V2: R2 } = await import('../sharkfantasy/fantasy/rules');
    const pr = initialPrices([{ id: 'a', clubId: 'x', position: 'DEF', xp: 27 }, { id: 'b', clubId: 'x', position: 'FWD', xp: 27 }, { id: 'c', clubId: 'x', position: 'FWD', xp: 45 }, { id: 'd', clubId: 'x', position: 'GK', xp: 45 }], R2);
    expect(pr.a).toBe(pr.b);              // 3 points a round costs the same at the back and up front
    expect(pr.c).toBeGreaterThan(pr.b);
    expect(pr.d).toBe(65);                // within the keepers' band
  });
});
