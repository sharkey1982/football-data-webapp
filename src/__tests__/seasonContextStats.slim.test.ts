// 18 Oct 2026: callers select only points_per_game and starts from
// source_payload (SEASON_STATS_SELECT) instead of the whole raw record. The
// result must be the same either way.
import { describe, expect, it } from 'vitest';
import { seasonContextStats, SEASON_STATS_SELECT } from '../lib/fplApi';

describe('seasonContextStats with the slim select', () => {
  it('selects only the two fields it reads', () => {
    expect(SEASON_STATS_SELECT).toBe('points_per_game:source_payload->>points_per_game, starts:source_payload->>starts');
  });
  it('gives the same answer from the slim fields as from the whole payload', () => {
    const full = seasonContextStats({ minutes: 540, source_payload: { points_per_game: '4.5', starts: '6', news: 'x'.repeat(500) } });
    const slim = seasonContextStats({ minutes: 540, points_per_game: '4.5', starts: '6' });
    expect(slim).toEqual(full);
    expect(slim).toEqual({ points_per_game: 4.5, avg_minutes_per_start: 90 });
  });
  it('uses games involved when given, and copes with missing fields', () => {
    expect(seasonContextStats({ minutes: 540, points_per_game: '4.5', starts: '6' }, 9).avg_minutes_per_start).toBe(60);
    expect(seasonContextStats({ minutes: null, points_per_game: null, starts: null })).toEqual({ points_per_game: null, avg_minutes_per_start: null });
    expect(seasonContextStats({ minutes: 100 })).toEqual({ points_per_game: null, avg_minutes_per_start: null });
  });
});
