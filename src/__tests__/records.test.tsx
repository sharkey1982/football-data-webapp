import { describe, it, expect } from 'vitest';
import { buildRecords, recordsHeadline, type MatchRecordRow, type StreakRow } from '../lib/recordsApi';
import { seasonRanks, type SeasonSummary, type RawTableRow } from '../lib/leagueSeasonApi';
import { renderRecordsPage } from '../entry-server';

const league = { league_id: 1, code: 'E0', name: 'Premier League', slug: 'premier-league', country: 'England' };
const S = (season_id: number, start_year: number, over: Partial<SeasonSummary> = {}): SeasonSummary => ({
  league_id: 1, season_id, start_year, clubs: 20, games_in_season: 38, comparable_group: '20x38', is_final: true, curtailed: false,
  split_format: false, covid_affected: false, matches: 380, goals_per_game: 2.6, home_win_share: 0.46, draw_share: 0.26, away_win_share: 0.28,
  goalless_share: 0.08, home_ppg_advantage: 0.4, champion_points: 90, highest_relegated_points: 35, lowest_safe_points: 36, noll_scully: 1.6, ...over,
});
const summaries = [
  S(14, 1992, { clubs: 22, games_in_season: 42, comparable_group: '22x42', champion_points: 84 }),
  S(5, 2017, { champion_points: 100, goals_per_game: 2.68 }),
  S(6, 2019, { curtailed: false, champion_points: 99 }),
  S(13, 2026, { is_final: false }),
];
const T = (season_id: number, team_id: number, position: number, played: number, points: number, over: Partial<RawTableRow> = {}): RawTableRow => ({
  league_id: 1, season_id, team_id, position, played, won: 0, drawn: 0, lost: 0, goals_for: 60, goals_against: 40, goal_difference: 20,
  deduction: 0, points, split_group: null, champion: position === 1, relegated: false, promoted: false, ...over,
});
const tables = [
  T(14, 1, 1, 42, 84), T(14, 2, 2, 42, 74), T(14, 3, 22, 42, 40, { relegated: true }),
  T(5, 4, 1, 38, 100, { goals_for: 106 }), T(5, 5, 2, 38, 81), T(5, 6, 20, 38, 16, { relegated: true, goals_against: 88 }),
  T(6, 7, 1, 38, 99), T(6, 4, 2, 38, 81), T(6, 8, 18, 38, 34, { relegated: true, deduction: 3 }),
  T(13, 4, 1, 6, 18), // current season: never in season records
];
const teams = new Map([[1, 'Man Utd'], [2, 'Aston Villa'], [3, 'Crystal Palace'], [4, 'Man City'], [5, 'Man Utd B'], [6, 'Derby'], [7, 'Liverpool'], [8, 'Watford']].map(([id, n]) => [id as number, { name: n as string, slug: String(n).toLowerCase().replace(/ /g, '-') }]));
const streaks: StreakRow[] = [
  { streak_type: 'unbeaten', rank: 1, team_id: 4, length: 49, start_date: '2003-05-07', end_date: '2004-10-16', start_season_id: 5, end_season_id: 6, ongoing: false, truncated_start: false },
  { streak_type: 'won', rank: 1, team_id: 4, length: 18, start_date: '2017-08-26', end_date: '2017-12-27', start_season_id: 5, end_season_id: 5, ongoing: false, truncated_start: false },
  { streak_type: 'won', rank: 1, team_id: 7, length: 18, start_date: '2019-10-27', end_date: '2020-02-24', start_season_id: 6, end_season_id: 6, ongoing: true, truncated_start: false },
];
const matches: MatchRecordRow[] = [
  { record: 'biggest_win', rank: 1, match_id: 1, season_id: 5, start_year: 2017, match_date: '2017-09-09', home_team_id: 4, away_team_id: 7, home_goals: 9, away_goals: 0 },
  { record: 'highest_scoring', rank: 1, match_id: 2, season_id: 6, start_year: 2019, match_date: '2019-09-29', home_team_id: 7, away_team_id: 8, home_goals: 7, away_goals: 4 },
];
const data = buildRecords({ league, summaries, tables, streaks, matches, teams });
const list = (id: string) => data.lists.find((l) => l.id === id)!;

describe('buildRecords', () => {
  it('ranks season records per game and ignores the season in progress', () => {
    const rows = list('most_points').rows;
    expect(rows.map((r) => `${r.team} ${r.value} ${r.season}`).slice(0, 2)).toEqual(['Man City 100 pts 2017/18', 'Liverpool 99 pts 2019/20']);
    // 81 from 38 games beats 84 from 42: per game, and the two 81s share third
    expect(rows.slice(2, 5).map((r) => [r.value, r.rank, r.tied])).toEqual([['81 pts', 3, true], ['81 pts', 3, true], ['84 pts', 5, false]]);
    expect(list('most_points').rows.some((r) => r.value === '18 pts')).toBe(false);
    expect(list('most_points').rows[0].teamPath).toBe('/football/teams/man-city/2017-18');
  });

  it('notes deductions and counts only relegated clubs for the relegated list', () => {
    const rel = list('relegated_most').rows;
    expect(rel.map((r) => r.team)).toEqual(['Crystal Palace', 'Watford', 'Derby']);
    expect(rel[1].detail).toContain('after a 3-point deduction');
  });

  it('works out title margins from the runner-up', () => {
    expect(list('title_margin').rows[0]).toMatchObject({ team: 'Man City', value: '19 pts', detail: '100 to Man Utd B’s 81' });
  });

  it('shows ties as shared ranks and flags ongoing runs', () => {
    const won = list('streak_won').rows;
    expect(won.map((r) => [r.rank, r.tied])).toEqual([[1, true], [1, true]]);
    expect(won[1].flag).toBe('ongoing');
    expect(list('streak_unbeaten').rows[0]).toMatchObject({ value: '49 matches', season: '2017/18 to 2019/20', detail: 'May 2003 – Oct 2004' });
  });

  it('writes a headline from the top records', () => {
    expect(data.headline).toBe(
      'Premier League records since 1992/93: the best season by points per game is Man City’s 100 points in 2017/18; the longest unbeaten run is Man City’s 49 matches (May 2003 – Oct 2004); the biggest win is Man City 9–0 Liverpool (2017/18).'
    );
    expect(recordsHeadline(league, 1992, [])).toBe('');
  });

  it('server-renders every list', () => {
    const page = renderRecordsPage(data);
    expect(page.html).toContain('Most league wins in a row');
    expect(page.html).toContain('=1');
    expect(page.canonical).toMatch(/\/football\/records\/premier-league$/);
  });
});

describe('seasonRanks', () => {
  it('ranks goals and champions’ points against comparable complete seasons', () => {
    const s = summaries[1];
    expect(seasonRanks({ league, summary: s, seasons: summaries })).toEqual([
      '2.68 goals per game: the highest of 3 complete Premier League seasons on file.',
    ]);
  });

  it('says nothing for a season in progress', () => {
    expect(seasonRanks({ league, summary: summaries[3], seasons: summaries })).toEqual([]);
  });
});
