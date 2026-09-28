import { describe, it, expect, vi } from 'vitest';

// The history-page questions, with each page's own loader mocked at the
// shapes it returns (figures from the live data, 28 Sep 2026).
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

vi.mock('../lib/historyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/historyApi')>('../lib/historyApi');
  return {
    ...actual,
    loadHistoryHubData: vi.fn(async () => ({ leagueCode: 'E0', comparableGroup: '20x38', reliability: [], leadersAfter10: { champions: 14, teamSeasons: 31 } })),
    getPaceBenchmarks: vi.fn(async () => [
      { matches_played: 10, outcome: 'champion', team_seasons: 31, p10: 19, p25: 20.5, p50: 23, p75: 25, p90: 28 },
      { matches_played: 10, outcome: 'all', team_seasons: 620, p10: 7, p25: 10, p50: 13, p75: 17.25, p90: 22 },
    ]),
  };
});

vi.mock('../lib/scorelinesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/scorelinesApi')>('../lib/scorelinesApi');
  const goalless: Record<number, number> = { 1: 785, 2: 804, 3: 769, 4: 811, 5: 689 };
  return {
    ...actual,
    getScorelines: vi.fn(async ({ leagueId }: { leagueId: number }) => [
      { goals_a: 0, goals_b: 0, outcome: 'D', matches: goalless[leagueId] },
      { goals_a: 1, goals_b: 0, outcome: 'W', matches: 10000 - goalless[leagueId] },
    ]),
  };
});

const league = { league_id: 1, code: 'E0', name: 'Premier League', slug: 'premier-league' };
vi.mock('../lib/leagueSeasonApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/leagueSeasonApi')>('../lib/leagueSeasonApi');
  const s = (start_year: number, lowest_safe_points: number, clubs = 20) => ({ start_year, lowest_safe_points, clubs, is_final: true, curtailed: false });
  return {
    ...actual,
    leagueBySlug: vi.fn(async () => league),
    leagueSummaries: vi.fn(async () => [s(1992, 30, 22), s(2004, 34), s(2008, 35), s(2019, 35), s(2023, 32), s(2010, 39)]),
  };
});

vi.mock('../lib/recordsApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/recordsApi')>('../lib/recordsApi');
  const row = (team: string, n: number, season: string, flag?: string) => ({ rank: 1, tied: false, team, teamPath: null, value: `${n} matches`, detail: 'Jan 2003 – Apr 2003', season, seasonPath: null, flag });
  return {
    ...actual,
    loadRecords: vi.fn(async () => ({
      league, firstYear: 1992, headline: '',
      lists: [{ id: 'streak_lost', title: '', rows: [row('Sunderland', 15, '2002/03'), row('Aston Villa', 11, '2015/16'), row('Wolves', 11, '2025/26', 'ongoing'), row('Sunderland', 9, '2005/06'), row('Norwich', 10, '2019/20')] }],
    })),
  };
});

import {
  getLeadersAfter10Trivia, getChampionPaceTrivia, getGoallessTrivia, getLowestSafeTrivia, getLosingRunTrivia,
} from '../lib/landingApi';

const correctLabels = (f: { options: string[]; correct: number[] }) => f.correct.map((i) => f.options[i]).sort();

describe('history-page trivia', () => {
  it('leaders after 10 matches: 14 of 31 is "about 45%"', async () => {
    const f = (await getLeadersAfter10Trivia())!;
    expect(correctLabels(f)).toEqual(['About 45%']);
    expect(f.explanation).toMatch(/14 of 31 leaders \(45%\).*didn’t win it/);
    expect(f.link.to).toBe('/football/history/what-happened-next');
  });

  it('champion pace: the median is the right answer', async () => {
    const f = (await getChampionPaceTrivia())!;
    expect(correctLabels(f)).toEqual(['23 points']);
    expect(f.explanation).toMatch(/typical club has 13/);
  });

  it('goalless draws: League Two tops it, not the Premier League', async () => {
    const f = (await getGoallessTrivia())!;
    expect(correctLabels(f)).toEqual(['League Two']);
    expect(f.options).toHaveLength(5);
    expect(f.explanation).toMatch(/National League is lowest at 6\.9%/);
  });

  it('lowest points to stay up: 20-club seasons only (1992/93 had 22)', async () => {
    const f = (await getLowestSafeTrivia())!;
    expect(correctLabels(f)).toEqual(['2023/24']);
    expect(f.options).not.toContain('1992/93');
    expect(f.link.to).toBe('/football/leagues/premier-league');
  });

  it('losing runs: one entry per club, ongoing runs flagged', async () => {
    const f = (await getLosingRunTrivia())!;
    expect(correctLabels(f)).toEqual(['Sunderland']);
    expect(f.options.filter((o) => o === 'Sunderland')).toHaveLength(1);
    expect(f.optionDetails!.some((d) => d.includes('(ongoing)'))).toBe(true);
    expect(f.link.to).toBe('/football/records/premier-league');
  });
});
