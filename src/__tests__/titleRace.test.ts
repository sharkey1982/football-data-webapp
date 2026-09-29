import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { buildTitleRace, pointsBins } from '../lib/titleRace';
import type { LeagueIndexData, LeagueIndexSeason } from '../lib/leagueSeasonApi';

const season = (start_year: number, team: string, points: number, o: Partial<LeagueIndexSeason> = {}): LeagueIndexSeason =>
  ({
    league_id: 1, season_id: start_year, start_year, clubs: 20, games_in_season: 38, comparable_group: '20x38',
    is_final: true, curtailed: false, split_format: false, covid_affected: false, matches: 380,
    goals_per_game: 2.7, home_win_share: null, draw_share: null, away_win_share: null, goalless_share: null,
    home_ppg_advantage: null, champion_points: points, highest_relegated_points: null, lowest_safe_points: null, noll_scully: null,
    eraName: 'Premier League', leader: { team_name: team, team_slug: team.toLowerCase(), points }, relegated: [], promoted: [],
    ...o,
  }) as LeagueIndexSeason;

const data: LeagueIndexData = {
  league: { league_id: 1, code: 'E0', name: 'Premier League', slug: 'premier-league', country: 'England' },
  seasons: [
    season(1992, 'Man Utd', 84, { clubs: 22, games_in_season: 42 }),
    season(2016, 'Chelsea', 93),
    season(2017, 'Man City', 100),
    season(2019, 'Liverpool', 99),
    season(2021, 'Man City', 93),
    season(2025, 'Arsenal', 85),
    // In progress: games_in_season is games played so far.
    season(2026, 'Man City', 15, { is_final: false, games_in_season: 5, matches: 50 }),
  ],
};

describe('title race summary', () => {
  const s = buildTitleRace(data)!;

  it('takes the season length from the latest finished season, not the one in progress', () => {
    expect(s.games).toBe(38);
    expect(s.excluded).toEqual({ seasons: 1, games: [42] });
    expect(s.spread.points).toEqual([93, 100, 99, 93, 85]);
  });

  it('counts titles from finished seasons only, most recent first on ties', () => {
    expect(s.titles.map((t) => [t.team, t.titles])).toEqual([['Man City', 2], ['Arsenal', 1], ['Liverpool', 1], ['Chelsea', 1], ['Man Utd', 1]]);
  });

  it('names the latest champion and the current leader separately', () => {
    expect(s.latest).toMatchObject({ team: 'Arsenal', points: 85, season: '2025/26' });
    expect(s.current).toMatchObject({ leader: 'Man City', points: 15, season: '2026/27' });
  });

  it('ranks highest totals by points per game', () => {
    expect(s.highest.map((r) => r.points)).toEqual([100, 99, 93, 93, 85]);
    expect(s.highest[2].season).toBe('2021/22');
  });

  it('bins points in fives, keeping empty bins', () => {
    expect(pointsBins([81, 84, 93])).toEqual([
      { from: 80, to: 84, count: 2 },
      { from: 85, to: 89, count: 0 },
      { from: 90, to: 94, count: 1 },
    ]);
  });

  it('needs three finished seasons', () => {
    expect(buildTitleRace({ ...data, seasons: data.seasons.slice(0, 2) })).toBeNull();
  });
});
