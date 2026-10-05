// Unit tests for src/lib/intlStats.ts (International pages).
import { describe, it, expect } from 'vitest';
import { countsByDate, isReported, reportedAsMatch, eloExpectation, groupTable, isUpset, pointsForWin, scoreText, teamsAfter, tournamentHistory, winnerOf, type EditionSummary, type IntlMatch, type IntlStage } from '../lib/intlStats';

function m(over: Partial<IntlMatch>): IntlMatch {
  return {
    match_key: 'k', match_date: '2026-07-19', home_team: 'Spain', home_slug: 'spain', home_name: 'Spain', away_team: 'Argentina', away_slug: 'argentina', away_name: 'Argentina',
    home_score: 1, away_score: 0, home_score_90: 1, away_score_90: 0, went_extra_time: false, shootout_winner: null, competition: 'FIFA World Cup', competition_slug: 'fifa-world-cup',
    competition_kind: 'tournament', edition_key: 'WC-2026', stage_code: 'GRP', stage_name: 'Group stage', stage_type: 'round_robin', group_label: 'A', matchday: 1, city: null, country: null,
    neutral: true, elo_home_pre: 2000, elo_away_pre: 2000, elo_change: 0, ...over,
  };
}

describe('intlStats', () => {
  it('scores show extra time and the shoot-out winner', () => {
    expect(scoreText({ home_score: 1, away_score: 0, went_extra_time: true, shootout_winner: null })).toBe('1–0 aet');
    expect(scoreText({ home_score: 1, away_score: 1, went_extra_time: true, shootout_winner: 'Italy' })).toBe('1–1 aet, Italy won on penalties');
    expect(winnerOf(m({ home_score: 1, away_score: 1, shootout_winner: 'Argentina' }))).toBe('Argentina');
  });

  it('Elo expectation gives the home side 100 points unless neutral', () => {
    expect(eloExpectation(m({}))).toBeCloseTo(0.5);
    expect(eloExpectation(m({ neutral: false }))).toBeCloseTo(1 / (10 ** (-100 / 400) + 1));
    // 400 points weaker away side wins: an upset; a draw never is.
    expect(isUpset(m({ elo_home_pre: 2400, home_score: 0, away_score: 1 }))).toBe(true);
    expect(isUpset(m({ elo_home_pre: 2400, home_score: 1, away_score: 1 }))).toBe(false);
  });

  it('2 points for a win before the 1994 World Cup and Euro 96', () => {
    expect(pointsForWin('WC-1990')).toBe(2);
    expect(pointsForWin('WC-1994')).toBe(3);
    expect(pointsForWin('EURO-1992')).toBe(2);
    expect(pointsForWin('EURO-1996')).toBe(3);
    expect(pointsForWin('UNL-2018-19')).toBe(3);
  });

  it('group table orders by points, then goal difference, and marks who went through', () => {
    const g = [
      m({ match_key: '1', home_team: 'A', home_name: 'A', away_team: 'B', away_name: 'B', home_score: 2, away_score: 0, home_score_90: 2, away_score_90: 0 }),
      m({ match_key: '2', home_team: 'C', home_name: 'C', away_team: 'B', away_name: 'B', home_score: 1, away_score: 1, home_score_90: 1, away_score_90: 1 }),
      m({ match_key: '3', home_team: 'A', home_name: 'A', away_team: 'C', away_name: 'C', home_score: 0, away_score: 0, home_score_90: 0, away_score_90: 0 }),
    ];
    const t = groupTable(g, 'WC-2026', new Set(['A', 'C']), ['A', 'B', 'C', 'D']);
    expect(t.map((r) => [r.team, r.pts, r.through])).toEqual([['A', 4, true], ['C', 2, true], ['B', 1, false], ['D', 0, false]]);
  });

  it('teams after a stage come from later rounds only', () => {
    const stages: IntlStage[] = [
      { stage_key: 'x|GRP', edition_key: 'x', code: 'GRP', name: 'Group stage', type: 'round_robin', stage_order: 10 },
      { stage_key: 'x|F', edition_key: 'x', code: 'F', name: 'Final', type: 'knockout', stage_order: 80 },
    ];
    const games = [m({ stage_code: 'GRP', home_team: 'A', away_team: 'B' }), m({ stage_code: 'F', home_team: 'A', away_team: 'C' })];
    expect([...teamsAfter(games, stages, 10)].sort()).toEqual(['A', 'C']);
  });

  it('tournament history: furthest round, winner and runner-up', () => {
    const eds = [
      { edition_key: 'WC-1966', competition: 'FIFA World Cup', label: '1966', winner: 'England', runner_up: 'Germany' },
      { edition_key: 'WC-1970', competition: 'FIFA World Cup', label: '1970', winner: 'Brazil', runner_up: 'Italy' },
    ] as EditionSummary[];
    const games = [
      m({ edition_key: 'WC-1966', stage_code: 'GRP', home_team: 'England', away_team: 'Uruguay' }),
      m({ edition_key: 'WC-1966', stage_code: 'F', home_team: 'England', away_team: 'Germany' }),
      m({ edition_key: 'WC-1970', stage_code: 'QF', home_team: 'Germany', away_team: 'England' }),
    ];
    expect(tournamentHistory('England', games, eds).map((c) => [c.label, c.reached])).toEqual([['1966', 'Winner'], ['1970', 'QF']]);
    expect(tournamentHistory('Germany', games, eds).map((c) => c.reached)).toEqual(['Runner-up', 'QF']);
  });

  it('calendar counts results by date and unplayed fixtures by UK date', () => {
    const counts = countsByDate([m({ match_date: '2026-09-24' })], [
      { fixture_key: 'a', edition_key: 'UNL-2026-27', kickoff_utc: '2026-09-24T23:30:00Z', home_team: 'X', home_slug: 'x', away_team: 'Y', away_slug: 'y', group_label: 'A1', round_number: 1, venue: null, home_score: null, away_score: null, match_key: null },
      { fixture_key: 'b', edition_key: 'UNL-2026-27', kickoff_utc: '2026-09-24T18:45:00Z', home_team: 'X', home_slug: 'x', away_team: 'Y', away_slug: 'y', group_label: 'A1', round_number: 1, venue: null, home_score: null, away_score: null, match_key: 'done' },
    ]);
    // 23:30 UTC on 24 Sep is 00:30 BST on 25 Sep; the played fixture is counted once, as a result.
    expect(counts).toEqual({ '2026-09-24': 1, '2026-09-25': 1 });
  });

  it('a fixture with a feed score and no confirmed result is a reported result', () => {
    const f = { fixture_key: 'UNL-2026-27|100', edition_key: 'UNL-2026-27', kickoff_utc: '2026-09-26T18:45:00Z', home_team: 'England', home_slug: 'england', away_team: 'Spain', away_slug: 'spain', group_label: 'A3', round_number: 1, venue: 'Wembley Stadium', home_score: 2, away_score: 3, match_key: null };
    expect(isReported(f)).toBe(true);
    expect(isReported({ ...f, match_key: 'x' })).toBe(false);
    expect(isReported({ ...f, home_score: null, away_score: null })).toBe(false);
    const m = reportedAsMatch(f);
    expect([m.match_date, m.home_score, m.away_score, m.group_label, m.competition_kind, m.elo_home_pre]).toEqual(['2026-09-26', 2, 3, 'A3', 'reported', null]);
    expect(groupTable([m], 'UNL-2026-27', new Set()).map((r) => [r.team, r.pts])).toEqual([['Spain', 3], ['England', 0]]);
  });
});
