import { describe, it, expect } from 'vitest';
import {
  summariseOutcomes,
  share,
  percentileRank,
  typicalPlayed,
  matchesUntilWithin,
  comparableGroupFor,
  leagueByCode,
  parseRange,
  type WhnRow,
} from '../lib/historyApi';


const row = (over: Partial<WhnRow>): WhnRow => ({
  season_id: 1, season_label: '2425', start_year: 2024, team_id: 1, team_name: 'A', team_slug: 'a',
  position_at_played: 1, teams_at_played: 20, points: 25, goal_difference: 10,
  final_position: 1, final_points: 90, clubs: 20,
  champion: true, top_four: true, top_six: true, relegated: false, promoted: false, ...over,
});

describe('summariseOutcomes', () => {
  it('counts outcomes with their own denominators', () => {
    const s = summariseOutcomes([
      row({ season_id: 1, final_position: 1, champion: true }),
      row({ season_id: 2, final_position: 3, champion: false, top_four: true }),
      row({ season_id: 3, final_position: 18, champion: false, top_four: false, top_six: false, relegated: true }),
      // relegation unknown (next season not on file) must not count as survived
      row({ season_id: 4, final_position: 10, champion: false, top_four: false, top_six: false, relegated: null }),
    ]);
    expect(s.teamSeasons).toBe(4);
    expect(s.seasons).toBe(4);
    expect(s.champions).toBe(1);
    expect(s.topFour).toBe(2);
    expect(s.relegated).toBe(1);
    expect(s.relegationKnown).toBe(3);
    expect(s.meanFinal).toBe(8);
    expect(s.medianFinal).toBe(6.5);
  });

  it('gives a final-position distribution for every place in the league, zeros included', () => {
    const s = summariseOutcomes([row({ final_position: 2 }), row({ final_position: 2, season_id: 2 })]);
    expect(s.distribution).toHaveLength(20);
    expect(s.distribution[1]).toEqual({ position: 2, count: 2 });
    expect(s.distribution[0]).toEqual({ position: 1, count: 0 });
  });

  it('measures movement as places gained between then and the end', () => {
    const s = summariseOutcomes([row({ position_at_played: 5, final_position: 2 }), row({ position_at_played: 5, final_position: 8, season_id: 2 })]);
    expect(s.meanMove).toBe(0);
  });

  it('is empty-safe', () => {
    const s = summariseOutcomes([]);
    expect(s.teamSeasons).toBe(0);
    expect(s.meanFinal).toBeNull();
    expect(s.distribution).toEqual([]);
  });
});

describe('helpers', () => {
  it('always shows the denominator', () => {
    expect(share(14, 31)).toBe('14 of 31 (45%)');
    expect(share(0, 0)).toBe('–');
  });

  it('ranks with ties counted half', () => {
    expect(percentileRank(10, [5, 10, 10, 20])).toBe(50);
    expect(percentileRank(30, [5, 10])).toBe(100);
    expect(percentileRank(1, [])).toBeNull();
  });

  it('takes the stage the season has reached as the most common matches played', () => {
    expect(typicalPlayed([{ played: 5 }, { played: 6 }, { played: 6 }, { played: 5 }, { played: 6 }])).toBe(6);
    // tie: the later stage
    expect(typicalPlayed([{ played: 5 }, { played: 6 }])).toBe(6);
  });

  it('finds when the table settles within a number of places', () => {
    const rel = [1, 2, 3].map((n) => ({ matches_played: n, seasons: 31, rank_correlation: 0, mean_abs_position_change: 4 - n, same_position_share: 0 }));
    expect(matchesUntilWithin(rel, 2)).toBe(2);
    expect(matchesUntilWithin(rel, 0.5)).toBeNull();
  });

  it('compares seasons of the same size as a double round robin', () => {
    expect(comparableGroupFor(20)).toBe('20x38');
    expect(comparableGroupFor(24)).toBe('24x46');
  });

  it('falls back to the Premier League for an unknown league code', () => {
    expect(leagueByCode('XX').code).toBe('E0');
    expect(leagueByCode('E2').id).toBe(3);
  });

  it('parses position and points ranges from the URL', () => {
    expect(parseRange('1')).toEqual([1, 1]);
    expect(parseRange('18-20')).toEqual([18, 20]);
    expect(parseRange('20-18')).toEqual([18, 20]);
    expect(parseRange('top')).toBeNull();
    expect(parseRange(null)).toBeNull();
  });
});
