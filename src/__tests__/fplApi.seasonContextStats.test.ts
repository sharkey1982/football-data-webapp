import { describe, it, expect } from 'vitest';
import { seasonContextStats } from '../lib/fplApi';

describe('seasonContextStats', () => {
  it('uses games-involved as the denominator when provided, not starts -- fixing the over-90 bug from sub-appearance minutes inflating the numerator without a matching start', () => {
    // A player who started 3 games (270 mins) and also came on as a sub
    // once (20 mins): 290 total minutes, starts=3. The old minutes/starts
    // calculation (290/3 = 96.7) exceeds a real match's length, which is
    // exactly the bug reported. games_involved=4 (3 starts + 1 sub
    // appearance) gives the correct 72.5.
    const player = { minutes: 290, source_payload: { starts: 3, points_per_game: '5.0' } };
    const result = seasonContextStats(player, 4);
    expect(result.avg_minutes_per_start).toBeCloseTo(72.5, 5);
    expect(result.avg_minutes_per_start).toBeLessThanOrEqual(90);
  });

  it('falls back to the old starts-based calculation when games-involved is not passed, so callers that have not been updated do not break', () => {
    const player = { minutes: 290, source_payload: { starts: 3, points_per_game: '5.0' } };
    const result = seasonContextStats(player);
    expect(result.avg_minutes_per_start).toBeCloseTo(290 / 3, 5);
  });

  it('returns null when games-involved is explicitly zero, rather than dividing by zero', () => {
    const player = { minutes: 0, source_payload: { starts: 0, points_per_game: '0' } };
    const result = seasonContextStats(player, 0);
    expect(result.avg_minutes_per_start).toBeNull();
  });

  it('still computes points_per_game the same way regardless of the games-involved parameter', () => {
    const player = { minutes: 290, source_payload: { starts: 3, points_per_game: '6.5' } };
    expect(seasonContextStats(player, 4).points_per_game).toBe(6.5);
    expect(seasonContextStats(player).points_per_game).toBe(6.5);
  });
});
