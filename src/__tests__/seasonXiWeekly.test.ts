import { describe, it, expect } from 'vitest';
import { seasonXiSpread, type SeasonXiWeek } from '../lib/seasonXiApi';

const w = (gameweek: number, total_points: number, blanks = 0): SeasonXiWeek => ({
  gameweek,
  total_points,
  players_returning: 11 - blanks,
  blanks,
});

describe('set-and-forget XI, week by week', () => {
  it('summarises the season: total, best, worst, average and spread', () => {
    const s = seasonXiSpread([w(1, 40), w(2, 60), w(3, 80)])!;
    expect(s.weeks).toBe(3);
    expect(s.total).toBe(180);
    expect(s.mean).toBe(60);
    expect(s.max).toBe(80);
    expect(s.bestWeek).toBe(3);
    expect(s.min).toBe(40);
    expect(s.worstWeek).toBe(1);
    expect(Math.round(s.stdDev)).toBe(16); // population sd of 40/60/80
  });

  it('keeps the gameweek of the best and worst weeks, not just the numbers', () => {
    const s = seasonXiSpread([w(12, 5), w(13, 93)])!;
    expect(s.worstWeek).toBe(12);
    expect(s.bestWeek).toBe(13);
  });

  it('has nothing to summarise for a season with no weekly history', () => {
    expect(seasonXiSpread([])).toBeNull();
  });
});
