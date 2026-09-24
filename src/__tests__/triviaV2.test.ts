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
vi.mock('../lib/modelApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/modelApi')>('../lib/modelApi');
  return { ...actual, getTeamStrengthSummary: vi.fn(async () => strength) };
});
let strength: { rows: { canonical_name: string; defence_strength: number }[] } = { rows: [] };

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) => makeBuilder(tables[t] ?? []),
    rpc: vi.fn(async (name: string) => ({ data: rpcs[name] ?? [], error: null })),
  },
}));

import {
  upcomingGameweek, tiedWithFirst,
  getLeagueGoalsTrivia, getModelHitRateTrivia, getScoringRuleTrivia, getInjuryListTrivia,
  getPriceRiskTrivia, getCleanSheetTrivia, getSetPieceTrivia, getTopFplPickTrivia, getMostCommonScorelineTrivia,
  getAllTimeScorersTrivia,
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

describe('every option\u2019s figure is revealed', () => {
  it('keeps each detail aligned with its option through the shuffle', async () => {
    rpcs.get_most_common_scoreline = [
      { home_goals: 1, away_goals: 1, occurrences: 300, total_matches: 2500, seasons_covered: 13 },
      { home_goals: 1, away_goals: 0, occurrences: 250, total_matches: 2500, seasons_covered: 13 },
      { home_goals: 2, away_goals: 1, occurrences: 200, total_matches: 2500, seasons_covered: 13 },
    ];
    for (let run = 0; run < 20; run++) {
      const f = (await getMostCommonScorelineTrivia())!;
      expect(f.optionDetails![f.options.indexOf('1\u20130')]).toBe('10.0% of matches');
      expect(correctLabels(f)).toEqual(['1\u20131']);
    }
  });
});

describe('historic questions name a season span, not the database', () => {
  it('scoreline question and every-club goals question both say how many seasons, computed from the data', async () => {
    rpcs.get_most_common_scoreline = [
      { home_goals: 1, away_goals: 1, occurrences: 300, total_matches: 2500, seasons_covered: 11 },
    ];
    const scoreline = (await getMostCommonScorelineTrivia())!;
    expect(scoreline.question).toBe('Which scoreline has come up most often in the Premier League over the last 11 seasons?');
    expect(scoreline.question).not.toMatch(/archive/i);
    expect(scoreline.explanation).not.toMatch(/archive/i);

    rpcs.get_all_time_top_scorers = [
      { display_name: 'Arsenal', goals: 1200, seasons_covered: 13 },
      { display_name: 'Man City', goals: 1150, seasons_covered: 13 },
    ];
    const scorers = (await getAllTimeScorersTrivia())!;
    expect(scorers.question).toBe('Across all five divisions over the last 13 seasons, which club has scored the most goals?');
    expect(scorers.question).not.toMatch(/archive/i);
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

  it('set pieces: a three-way tie makes all three correct -- and it appears every week', async () => {
    rpcs.get_set_piece_index = [
      { player_name: 'B.Fernandes', team_name: 'Manchester United', index_score: 47.4, duties: 3 },
      { player_name: 'Szoboszlai', team_name: 'Liverpool', index_score: 47.4, duties: 3 },
      { player_name: 'Gro\u00df', team_name: 'Brighton', index_score: 47.4, duties: 3 },
      { player_name: 'Saka', team_name: 'Arsenal', index_score: 40.8, duties: 3 },
    ];
    const f = (await getSetPieceTrivia())!;
    expect(correctLabels(f)).toEqual(['B.Fernandes', 'Gro\u00df', 'Szoboszlai']);
    expect(f.explanation).toMatch(/^Joint top/);
    expect(f.link?.to).toBe('/fpl/set-pieces');
  });
});

describe('one question per page, from that page\u2019s own data', () => {
  it('League Insights: the surprising answer -- the National League outscores the Premier League this season', async () => {
    rpcs.get_cross_league_summary = [
      { league_code: 'E0', league_name: 'Premier League', season_label: '2526', goals_per_game: 2.75 },
      { league_code: 'EC', league_name: 'National League', season_label: '2526', goals_per_game: 2.92 },
      { league_code: 'E1', league_name: 'Championship', season_label: '2526', goals_per_game: 2.61 },
      { league_code: 'EC', league_name: 'National League', season_label: '2324', goals_per_game: 3.5 }, // older season: ignored
    ];
    const f = (await getLeagueGoalsTrivia())!;
    expect(correctLabels(f)).toEqual(['National League']);
    expect(f.optionDetails![f.options.indexOf('Premier League')]).toBe('2.75 goals a game');
    expect(f.explanation).toMatch(/ahead of the Premier League\u2019s 2\.75/);
    expect(f.link?.to).toBe('/football/leagues-compared');
  });

  it('Model Accuracy: buckets the hit rate and tells the honest story about backing the home team', async () => {
    rpcs.get_model_accuracy_summary = [{ fixtures: 166, correct: 68, hit_rate: 41.0, always_home_hit_rate: 41.6, model_brier: 0.6614, uniform_brier: 0.6667, mean_p_actual: 35.6 }];
    const f = (await getModelHitRateTrivia())!;
    expect(correctLabels(f)).toEqual(['About 40%']);
    expect(f.explanation).toMatch(/68 of 166/);
    expect(f.explanation).toMatch(/Always backing the home team would have scored 42%/);
    expect(f.link?.to).toBe('/football/model-accuracy');
  });

  it('Scoring Rules: a defender\u2019s goal, with every other position\u2019s value revealed', async () => {
    tables.fpl_scoring_rules = [
      { rule_id: 1, rule_code: 'goal', player_position: 'GK', points: 10, threshold: null, notes: null },
      { rule_id: 2, rule_code: 'goal', player_position: 'DEF', points: 6, threshold: null, notes: null },
      { rule_id: 3, rule_code: 'goal', player_position: 'MID', points: 5, threshold: null, notes: null },
      { rule_id: 4, rule_code: 'goal', player_position: 'FWD', points: 4, threshold: null, notes: null },
    ];
    const f = (await getScoringRuleTrivia())!;
    expect(correctLabels(f)).toEqual(['6 points']);
    expect(f.optionDetails![f.options.indexOf('10 points')]).toBe('what a goalkeeper gets');
  });

  it('Physio Room: counts players per club, and ties all count', async () => {
    rpcs.get_injury_report = [
      ...Array(3).fill({ team_name: 'Hull' }), ...Array(3).fill({ team_name: 'Coventry' }), ...Array(2).fill({ team_name: 'Brighton' }),
    ].map((r, i) => ({ ...r, fpl_player_id: i, web_name: `P${i}`, status: 'i' }));
    const f = (await getInjuryListTrivia())!;
    expect(correctLabels(f)).toEqual(['Coventry', 'Hull']);
    expect(f.link?.to).toBe('/fpl/injuries');
  });
});

describe('Team Strength: the clean-sheet question', () => {
  it('uses the best defence, derives the chance from the page\u2019s goals-against figure, and links to Team Strength', async () => {
    // goals against = exp(-defence_strength); P(clean sheet) = exp(-goals against)
    strength = { rows: [
      { canonical_name: 'Chelsea', defence_strength: 0.1 },
      { canonical_name: 'Arsenal', defence_strength: 0.25 }, // GA 0.78 -> CS 46%
    ] } as never;
    const f = (await getCleanSheetTrivia())!;
    expect(f.question).toMatch(/expect Arsenal to keep a clean sheet/);
    expect(correctLabels(f)).toEqual(['About 50%']);
    expect(f.explanation).toMatch(/^About 46%/);
    expect(f.explanation).toMatch(/0\.78 goals a game/);
    expect(f.link.to).toBe('/team-strength');
  });
});

describe('every question leads somewhere', () => {
  it('the hubs only contain questions with a link (also enforced by the type)', async () => {
    const { getFootballTrivia, getFplTrivia } = await import('../lib/landingApi');
    for (const f of [...(await getFootballTrivia()), ...(await getFplTrivia())]) expect(f.link?.to).toMatch(/^\//);
  });
});
