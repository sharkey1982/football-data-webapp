import { describe, expect, it } from 'vitest';
import {
  allOutChance, analyse, bestPath, leverage, lineForPot, runEntries, outcomeProbs, pickValue, roundRewards, run, simulateField, solve,
  type Cell, type Problem,
} from '../lib/lastManStanding';

const cell = (p: number, opponent = 'X', home = true): Cell => ({ p, opponent, home, fixtureId: 1, kickoff: null, source: 'market' });

function randomProblem(T: number, R: number, seed: number, blanks = false): Problem {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return {
    teams: Array.from({ length: T }, (_, i) => ({ id: i + 1, name: `T${i}` })),
    rounds: Array.from({ length: R }, (_, k) => k + 6),
    cells: Array.from({ length: R }, () => Array.from({ length: T }, () => (blanks && rand() < 0.15 ? null : cell(0.2 + 0.7 * rand())))),
  };
}

/** Every pick sequence, the slow way. */
function brute(pr: Problem, used: number, reward: number[], ends: number[], k = 0): number {
  if (k >= pr.rounds.length) return 0;
  let best = 0;
  pr.teams.forEach((_, t) => {
    if ((used >>> t) & 1) return;
    const c = pr.cells[k][t];
    if (!c) return;
    const v = c.p * (reward[k] + (1 - ends[k]) * brute(pr, used | (1 << t), reward, ends, k + 1));
    if (v > best) best = v;
  });
  return best;
}

describe('outcomeProbs', () => {
  it('sums to one and favours the bigger expected goals', () => {
    const [h, d, a] = outcomeProbs(2.086, 0.74);
    expect(h + d + a).toBeCloseTo(1, 9);
    expect(h).toBeCloseTo(0.686, 3); // Arsenal v Leeds, GW6 2026/27 (matches the Python prototype)
    expect(a).toBeLessThan(h);
  });
  it('is symmetric', () => {
    const [h, , a] = outcomeProbs(1.3, 1.3);
    expect(h).toBeCloseTo(a, 9);
  });
});

describe('solve', () => {
  it('matches brute force on small problems, with blanks and a used team', () => {
    for (const seed of [1, 7, 42, 99]) {
      const pr = randomProblem(6, 5, seed, true);
      const reward = [0, 0.05, 0.1, 0.2, 0.3];
      const ends = [0, 0.1, 0.2, 0.5, 1];
      for (const used of [0, 0b000100]) {
        const sol = solve(pr, used, reward, ends);
        expect(sol.V[used]).toBeCloseTo(brute(pr, used, reward, ends), 5);
      }
    }
  });

  it('a fixed horizon of 1 round picks the favourite', () => {
    const pr = randomProblem(8, 6, 3);
    const sol = solve(pr, 0, [1, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1]);
    const fav = pr.cells[0].reduce((b, c, t) => (c!.p > pr.cells[0][b]!.p ? t : b), 0);
    expect(bestPath(sol, pr)[0].team).toBe(fav);
  });

  it('saves a team for a much better fixture later', () => {
    // A: 70% now, 95% next round. B: 65% now, 30% next. Two rounds, survive both.
    const pr: Problem = {
      teams: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      rounds: [6, 7],
      cells: [[cell(0.7), cell(0.65)], [cell(0.95), cell(0.3)]],
    };
    const sol = solve(pr, 0, [0, 1], [0, 1]);
    const path = bestPath(sol, pr);
    expect(path.map((s) => pr.teams[s.team].name)).toEqual(['B', 'A']);
    expect(sol.V[0]).toBeCloseTo(0.65 * 0.95, 6);
    expect(pickValue(sol, pr, 0, 0, 0)).toBeCloseTo(0.7 * 0.3, 6);
  });

  it('never picks a team without a fixture or one already used', () => {
    const pr = randomProblem(10, 8, 11, true);
    pr.cells[0][3] = null;
    const sol = solve(pr, 1 << 5, [0, 0, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2], [0, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 1]);
    const path = bestPath(sol, pr);
    const seen = new Set<number>();
    path.forEach((s, k) => {
      expect(pr.cells[k][s.team]).not.toBeNull();
      expect(s.team).not.toBe(5);
      expect(seen.has(s.team)).toBe(false);
      seen.add(s.team);
    });
    expect(path[0].team).not.toBe(3);
  });

  it('handles 24 teams (Championship) quickly enough', () => {
    const pr = randomProblem(24, 14, 5);
    const reward = Array.from({ length: 14 }, (_, k) => (k < 6 ? 0 : 0.05));
    const ends = Array.from({ length: 14 }, (_, k) => (k < 6 ? 0 : 0.2));
    const t0 = Date.now();
    const sol = solve(pr, 0, reward, ends);
    expect(sol.V[0]).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(60000);
  }, 120000);
});

describe('field', () => {
  const pr = randomProblem(20, 20, 21);
  it('a bigger field runs longer', () => {
    const prize = { sideShare: 0.2, line: 20, linePassed: false };
    const left3 = (n: number) => simulateField(pr, { opponents: n, beta: 8, sims: 400, seed: 1 }, prize).meanLeft[3];
    expect(left3(4000)).toBeGreaterThan(5 * left3(200));
  });
  it('probabilities are consistent', () => {
    const c = simulateField(pr, { opponents: 1000, beta: 8, sims: 300, seed: 2 }, { sideShare: 0.2, line: 20, linePassed: false });
    expect(c.running[0]).toBe(1);
    const ext = c.extinct.reduce((a, b) => a + b, 0);
    expect(ext).toBeLessThanOrEqual(1 + 1e-9);
    c.running.forEach((r, k) => k > 0 && expect(r).toBeLessThanOrEqual(c.running[k - 1] + 1e-12));
    const { reward, ends } = roundRewards(c, { sideShare: 0.2, line: 20, linePassed: false });
    reward.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    ends.forEach((v) => expect(v).toBeLessThanOrEqual(1));
  });
  it('a line already passed pays no side prize', () => {
    const c = simulateField(pr, { opponents: 15, beta: 8, sims: 200, seed: 3 }, { sideShare: 0.2, line: 20, linePassed: true });
    expect(c.lineShare.every((v) => v === 0)).toBe(true);
  });
  it('with no opponents left, the entry has already won', () => {
    const out = run({ problem: pr, usedMask: 0, field: { opponents: 0, beta: 8, sims: 50, seed: 1 }, prize: { sideShare: 0.2, line: 20, linePassed: true } });
    expect(out.curve.running[0]).toBe(1);
  });
});

describe('analyse', () => {
  it('labels the best pick and explains a saved favourite', () => {
    const pr: Problem = {
      teams: [{ id: 1, name: 'Arsenal' }, { id: 2, name: 'Chelsea' }, { id: 3, name: 'Fulham' }],
      rounds: [6, 7],
      cells: [[cell(0.74, 'Leeds'), cell(0.68, 'Bournemouth'), cell(0.3, 'Hull', false)], [cell(0.9, 'Hull'), cell(0.3, 'Spurs'), cell(0.2, 'City')]],
    };
    const sol = solve(pr, 0, [0, 1], [0, 1]);
    const a = analyse(sol, pr, null);
    expect(a.best?.name).toBe('Chelsea');
    expect(a.candidates.find((c) => c.name === 'Arsenal')?.tag).toBe('Best survival');
    expect(a.why).toContain('Arsenal are 6.0 pts more likely');
    expect(a.why).toContain('GW7');
  });
});

describe('lineForPot', () => {
  it('follows SportSkins rule 5.1.14', () => {
    expect(lineForPot(null)).toBe(20);
    expect(lineForPot(40000)).toBe(20);
    expect(lineForPot(60000)).toBe(30);
    expect(lineForPot(90000)).toBe(50);
    expect(lineForPot(150000)).toBe(100);
  });
});

describe('several entries', () => {
  const pr: Problem = {
    teams: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }, { id: 4, name: 'D' }],
    rounds: [6],
    cells: [[
      { ...cell(0.5), fixtureId: 1 }, { ...cell(0.3), fixtureId: 1 },
      { ...cell(0.6), fixtureId: 2 }, { ...cell(0.25), fixtureId: 2 },
    ]],
  };
  it('both sides of one match only all lose on a draw', () => {
    expect(allOutChance(pr, [0, 1])).toBeCloseTo(0.2, 9);
    expect(allOutChance(pr, [0, 0])).toBeCloseTo(0.5, 9);
    expect(allOutChance(pr, [0, 2])).toBeCloseTo(0.5 * 0.4, 9);
  });
  it('spreads are efficient: the best-value one first, each safer one costs value', () => {
    const out = runEntries({ problem: pr, usedMasks: [0, 0, 0], field: { opponents: 100, beta: 8, sims: 100, seed: 1 }, prize: { sideShare: 0.2, line: 20, linePassed: false } });
    expect(out.spreads[0].relative).toBeCloseTo(1, 9);
    for (let i = 1; i < out.spreads.length; i++) {
      expect(out.spreads[i].relative).toBeLessThanOrEqual(out.spreads[i - 1].relative);
      expect(out.spreads[i].allOut).toBeLessThan(out.spreads[i - 1].allOut);
    }
  });
});

describe('leverage', () => {
  it('a team the field avoids gains when the popular team loses', () => {
    const pr: Problem = {
      teams: [{ id: 1, name: 'Pop' }, { id: 2, name: 'Opp' }, { id: 3, name: 'Quiet' }, { id: 4, name: 'Opp2' }],
      rounds: [6],
      cells: [[
        { ...cell(0.7, 'Opp'), fixtureId: 1 }, { ...cell(0.1, 'Pop', false), fixtureId: 1 },
        { ...cell(0.6, 'Opp2'), fixtureId: 2 }, { ...cell(0.2, 'Quiet', false), fixtureId: 2 },
      ]],
    };
    const lev = leverage(pr, [0.9, 0, 0.1, 0], 20000, 3);
    expect(lev[2]).toBeGreaterThan(1.1);
    expect(lev[0]).toBeLessThan(1);
  });
});
