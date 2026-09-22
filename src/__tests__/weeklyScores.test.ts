import { describe, it, expect } from 'vitest';
import { weeklyScores, weeklyDistribution } from '../lib/fplOptimizerApi';
import type { FplOptimizerPlayer, FplOptimizerWeeklyPlan } from '../lib/fplOptimizerApi';

// Shaped like the stored hindsight result: each player carries points per
// gameweek, and each week names its XI and captain.
const player = (name: string, position: number, pts: Record<number, number>): FplOptimizerPlayer =>
  ({ id: name.length, name, team: 'Team', price: 5, position, gw_xpts: pts, total_xpts: Object.values(pts).reduce((a, b) => a + b, 0) }) as unknown as FplOptimizerPlayer;

const squad = [
  player('Keeper', 1, { 1: 6, 2: 2 }),
  player('Star', 4, { 1: 17, 2: 4 }),
  player('Benched', 3, { 1: 20, 2: 1 }),
];

const plan: FplOptimizerWeeklyPlan[] = [
  { matchweek: 1, xi: ['Keeper', 'Star'], captain: 'Star', vice_captain: 'Keeper', formation: '5-3-2', bench_order: ['Benched'], xi_xpts: 23 } as unknown as FplOptimizerWeeklyPlan,
  { matchweek: 2, xi: ['Keeper', 'Star'], captain: 'Keeper', vice_captain: 'Star', formation: '5-3-2', bench_order: ['Benched'], xi_xpts: 6 } as unknown as FplOptimizerWeeklyPlan,
];

describe('weekly scores', () => {
  it('totals the starting XI and counts the captain twice', () => {
    const s = weeklyScores(squad, plan);
    expect(s[0]).toEqual({ matchweek: 1, xiPoints: 23, captainExtra: 17, total: 40 });
    expect(s[1]).toEqual({ matchweek: 2, xiPoints: 6, captainExtra: 2, total: 8 });
  });

  it('ignores players on the bench, however well they scored', () => {
    // Benched took 20 in gameweek 1 and must not appear in the total
    expect(weeklyScores(squad, plan)[0].total).toBe(40);
  });

  it('treats a missing gameweek as no points rather than breaking', () => {
    const thin = [player('Keeper', 1, { 1: 6 })];
    const s = weeklyScores(thin, [{ ...plan[1], xi: ['Keeper'], captain: 'Keeper' } as FplOptimizerWeeklyPlan]);
    expect(s[0].total).toBe(0);
  });

  it('summarises the distribution: best, worst, average and spread', () => {
    const d = weeklyDistribution(weeklyScores(squad, plan))!;
    expect(d.weeks).toBe(2);
    expect(d.max).toBe(40);
    expect(d.bestWeek).toBe(1);
    expect(d.min).toBe(8);
    expect(d.worstWeek).toBe(2);
    expect(d.mean).toBe(24);
    expect(d.stdDev).toBe(16); // population sd of 40 and 8
  });

  it('returns nothing to summarise when there are no weeks', () => {
    expect(weeklyDistribution([])).toBeNull();
  });
});
