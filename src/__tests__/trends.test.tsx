import { describe, it, expect } from 'vitest';
import { comparableSeasons, metricSeries, periodChanges, trendsHeadline, trendsPath, type TrendsData } from '../lib/trendsApi';
import { seasonRanks, type SeasonSummary } from '../lib/leagueSeasonApi';
import { renderTrendsPage } from '../entry-server';

const league = { league_id: 1, code: 'E0', name: 'Premier League', slug: 'premier-league', country: 'England' };
const S = (start_year: number, over: Partial<SeasonSummary> = {}): SeasonSummary => ({
  league_id: 1, season_id: start_year, start_year, clubs: 20, games_in_season: 38, comparable_group: '20x38', is_final: true, curtailed: false,
  split_format: false, covid_affected: false, matches: 380, goals_per_game: 2.5, home_win_share: 0.48, draw_share: 0.27, away_win_share: 0.25,
  goalless_share: 0.08, home_ppg_advantage: 0.5, champion_points: 85, highest_relegated_points: 35, lowest_safe_points: 36, noll_scully: 1.5, ...over,
});
const seasons = [
  S(2010), S(2011), S(2012, { goals_per_game: 2.7 }),
  S(2019, { covid_affected: true, home_ppg_advantage: 0.1 }), S(2020, { covid_affected: true, home_ppg_advantage: 0.0 }),
  S(2021, { goals_per_game: 2.8, home_ppg_advantage: 0.3, draw_share: 0.22 }), S(2022, { goals_per_game: 2.9, home_ppg_advantage: 0.3, draw_share: 0.22 }),
  S(2023, { goals_per_game: 3.0, home_ppg_advantage: 0.3, draw_share: 0.22 }),
  S(2026, { is_final: false, matches: 60, goals_per_game: 3.4 }),
];
const data: TrendsData = { league, seasons };

describe('League Lab', () => {
  it('compares first and last complete seasons, leaving out Covid and the current season', () => {
    expect(comparableSeasons(seasons).map((s) => s.start_year)).toEqual([2010, 2011, 2012, 2021, 2022, 2023]);
    const ch = periodChanges(data);
    const g = ch.find((c) => c.metric.key === 'gpg')!;
    expect(g.n).toBe(3);
    expect(g.from).toBeCloseTo(2.5667, 3);
    expect(g.to).toBeCloseTo(2.9, 3);
    expect(g.firstSpan).toBe('2010/11–2012/13');
  });

  it('writes a headline with direction words', () => {
    expect(trendsHeadline(data)).toBe(
      'Premier League, 2010/11–2012/13 against 2021/22–2023/24: goals per game rose from 2.57 to 2.90; home advantage (home minus away points per game) fell from 0.50 to 0.30; the share of draws fell from 27% to 22%.'
    );
  });

  it('charts the season so far but not curtailed seasons', () => {
    const pts = metricSeries([...seasons, S(2019, { season_id: 99, curtailed: true })], (s) => s.goals_per_game);
    expect(pts.at(-1)).toEqual({ x: 2026, y: 3.4 });
    expect(pts.filter((p) => p.x === 2019)).toHaveLength(1);
  });

  it('uses the short URL for the Premier League and server-renders the headline', () => {
    expect(trendsPath(league)).toBe('/football/history/trends');
    expect(trendsPath({ slug: 'league-two' })).toBe('/football/history/trends/league-two');
    const page = renderTrendsPage(data);
    expect(page.html).toContain('goals per game rose from 2.57 to 2.90');
    expect(page.canonical).toMatch(/\/football\/history\/trends$/);
  });
});

describe('seasonRanks shows only notable rankings', () => {
  it('omits a mid-table ranking', () => {
    const many = Array.from({ length: 10 }, (_, i) => S(2000 + i, { goals_per_game: 2 + i / 10 }));
    expect(seasonRanks({ league, summary: many[5], seasons: many })).toEqual([]);
    expect(seasonRanks({ league, summary: many[9], seasons: many })[0]).toMatch(/^2\.90 goals per game: the highest of 10/);
  });
});
