import { describe, it, expect, vi, beforeEach } from 'vitest';

// Realistic shapes for the questions changed in Trivia v2. The mock mirrors
// the supabase-js calls the builders make: chainable .from() builders and
// .rpc() by function name.
const tables: Record<string, unknown[]> = {};
const rpcs: Record<string, unknown[]> = {};
const makeBuilder = (rows: unknown[]) => {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'not']) b[m] = vi.fn(() => b);
  b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null });
  return b;
};
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) => makeBuilder(tables[t] ?? []),
    rpc: vi.fn(async (name: string) => ({ data: rpcs[name] ?? [], error: null })),
  },
}));

import {
  upcomingGameweek, tiedWithFirst, isSetPieceWeek,
  getComebackTrivia, getPriceRiskTrivia, getSetPieceTrivia, getTopFplPickTrivia, getMostCommonScorelineTrivia,
} from '../lib/landingApi';

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(rpcs)) delete rpcs[k];
  vi.useRealTimers();
});

const correctLabels = (f: { options: string[]; correct: number[] }) => f.correct.map((i) => f.options[i]).sort();

describe('the gameweek the quiz talks about', () => {
  it('skips a gameweek that has started, even with a match left to play', async () => {
    // Today's real situation: GW5 has played matches and one leftover (Fulham v Man Utd).
    tables.fixtures = [
      { fixture_id: 41, matchweek: 5, status: 'played' },
      { fixture_id: 45, matchweek: 5, status: 'scheduled' },
      { fixture_id: 51, matchweek: 6, status: 'scheduled' },
      { fixture_id: 55, matchweek: 6, status: 'scheduled' },
    ];
    expect(await upcomingGameweek()).toEqual({ matchweek: 6, fixtureIds: [51, 55] });
  });

  it('names that gameweek in the question', async () => {
    tables.fixtures = [{ fixture_id: 51, matchweek: 6, status: 'scheduled' }];
    tables.fpl_player_projections = [{ fpl_player_id: 1, expected_fpl_points: 7.2 }, { fpl_player_id: 2, expected_fpl_points: 6.1 }];
    tables.fpl_players = [{ fpl_player_id: 1, web_name: 'Haaland', canonical_team_id: 9 }, { fpl_player_id: 2, web_name: 'Salah', canonical_team_id: 8 }];
    tables.teams = [{ team_id: 9, display_name: 'Manchester City' }, { team_id: 8, display_name: 'Liverpool' }];
    const f = (await getTopFplPickTrivia())!;
    expect(f.question).toMatch(/^Gameweek 6:/);
    expect(f.explanation).toMatch(/Gameweek 6/);
    expect(f.link?.to).toBe('/fpl/player-points');
  });
});

describe('ties', () => {
  it('finds every value tied with the first', () => {
    expect(tiedWithFirst([47.4, 47.4, 47.4, 40.8])).toEqual([0, 1, 2]);
    expect(tiedWithFirst([5, 4, 4])).toEqual([0]);
    expect(tiedWithFirst([])).toEqual([]);
  });
});

describe('the comeback question', () => {
  it('has every option correct, each with its own story, and no Premier League giveaway', async () => {
    rpcs.get_biggest_comebacks = [
      { home: 'Leicester', away: 'Southampton', ht_home: 3, ht_away: 0, ft_home: 3, ft_away: 4, league_code: 'E1', match_date: '2026-02-10', deficit: 3 },
      { home: 'Bournemouth', away: 'Luton', ht_home: 0, ht_away: 3, ft_home: 4, ft_away: 3, league_code: 'E0', match_date: '2024-03-13', deficit: 3 },
    ];
    const f = (await getComebackTrivia())!;
    expect(f.question).not.toMatch(/Premier League/);
    expect(f.correct).toHaveLength(f.options.length);
    expect(correctLabels(f)).toEqual(['Bournemouth', 'Southampton']);
    const story = (club: string) => f.optionDetails![f.options.indexOf(club)];
    expect(story('Southampton')).toBe('0\u20133 down at Leicester, won 4\u20133 \u00b7 Championship, Feb 2026');
    expect(story('Bournemouth')).toBe('0\u20133 down at home to Luton, won 4\u20133 \u00b7 Premier League, Mar 2024');
  });
});

describe('every option\u2019s figure is revealed', () => {
  it('keeps each detail aligned with its option through the shuffle', async () => {
    rpcs.get_most_common_scoreline = [
      { home_goals: 1, away_goals: 1, occurrences: 300, total_matches: 2500 },
      { home_goals: 1, away_goals: 0, occurrences: 250, total_matches: 2500 },
      { home_goals: 2, away_goals: 1, occurrences: 200, total_matches: 2500 },
    ];
    for (let run = 0; run < 20; run++) {
      const f = (await getMostCommonScorelineTrivia())!;
      expect(f.optionDetails![f.options.indexOf('1\u20130')]).toBe('10.0% of matches');
      expect(correctLabels(f)).toEqual(['1\u20131']);
    }
  });
});

describe('questions that send people around the site', () => {
  it('Bullpit: only risers, the highest pressure is correct, with net transfers and a link', async () => {
    rpcs.get_price_change_risk = [
      { web_name: 'Kostoulas', team_name: 'Brighton', direction: 'rise', pressure: 65.2, net_transfers: 41000 },
      { web_name: 'Elanga', team_name: 'Newcastle', direction: 'fall', pressure: 90, net_transfers: -60000 },
      { web_name: 'Manzambi', team_name: 'Brentford', direction: 'rise', pressure: 57.9, net_transfers: 33000 },
    ];
    const f = (await getPriceRiskTrivia())!;
    expect(f.options).not.toContain('Elanga');
    expect(correctLabels(f)).toEqual(['Kostoulas']);
    expect(f.optionDetails![f.options.indexOf('Kostoulas')]).toBe('Brighton \u00b7 +41,000 net transfers');
    expect(f.link?.to).toBe('/fpl/price-risk');
  });

  it('set pieces: a three-way tie makes all three correct -- and it only appears on alternate weeks', async () => {
    rpcs.get_set_piece_index = [
      { player_name: 'B.Fernandes', team_name: 'Manchester United', index_score: 47.4, duties: 3 },
      { player_name: 'Szoboszlai', team_name: 'Liverpool', index_score: 47.4, duties: 3 },
      { player_name: 'Gro\u00df', team_name: 'Brighton', index_score: 47.4, duties: 3 },
      { player_name: 'Saka', team_name: 'Arsenal', index_score: 40.8, duties: 3 },
    ];
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:00Z')); // ISO week 39: odd
    expect(isSetPieceWeek()).toBe(false);
    expect(await getSetPieceTrivia()).toBeNull();
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z')); // ISO week 40: even
    expect(isSetPieceWeek()).toBe(true);
    const f = (await getSetPieceTrivia())!;
    vi.useRealTimers();
    expect(correctLabels(f)).toEqual(['B.Fernandes', 'Gro\u00df', 'Szoboszlai']);
    expect(f.explanation).toMatch(/^Joint top/);
    expect(f.link?.to).toBe('/fpl/set-pieces');
  });
});
