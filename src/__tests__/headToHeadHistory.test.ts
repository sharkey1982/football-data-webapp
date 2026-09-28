import { describe, it, expect } from 'vitest';
import { headToHeadSentence, seasonText, summariseHeadToHead } from '../lib/headToHeadHistory';
import type { MatchWithNames } from '../lib/matchesApi';

// Team A = 1 (Arsenal), team B = 2 (Tottenham). Newest first, as getHeadToHead returns them.
const m = (date: string, home: number, hg: number | null, ag: number | null, league = 'Premier League', season = '2324'): MatchWithNames =>
  ({
    match_id: Number(date.replace(/-/g, '')), match_date: date, home_team_id: home, away_team_id: home === 1 ? 2 : 1,
    full_time_home_goals: hg, full_time_away_goals: ag, home_team_name: home === 1 ? 'Arsenal' : 'Tottenham',
    away_team_name: home === 1 ? 'Tottenham' : 'Arsenal', league_name: league, league_code: 'E0', season_label: season,
  }) as unknown as MatchWithNames;

const meetings = [
  m('2024-04-28', 2, 2, 3),                 // A away win 3-2
  m('2023-09-24', 1, 2, 2),                 // draw 2-2
  m('2023-01-15', 2, 0, 2),                 // A away win 2-0
  m('2022-10-01', 1, 3, 1),                 // A home win 3-1
  m('2021-09-26', 2, 3, 1),                 // B home win 3-1
  m('2020-12-06', 2, 2, 0, 'Premier League', '2021'), // B home win 2-0
  m('2020-01-01', 1, 5, 0, 'League Cup', '1920'),     // A home win 5-0
  m('1992-12-12', 1, 1, 1, 'Premier League', '9293'), // draw 1-1, first meeting
  m('2025-01-01', 1, null, null),           // no result: ignored
];

describe('summariseHeadToHead', () => {
  const h = summariseHeadToHead(meetings, 1);

  it('counts the record, goals and venue splits from team A’s side', () => {
    expect(h.played).toBe(8);
    expect(h.overall).toEqual({ aWins: 4, draws: 2, bWins: 2 });
    expect([h.aGoals, h.bGoals]).toEqual([17, 11]);
    expect(h.aHome).toEqual({ aWins: 2, draws: 2, bWins: 0 });
    expect(h.bHome).toEqual({ aWins: 2, draws: 0, bWins: 2 });
  });

  it('finds the biggest wins each way and the first meeting', () => {
    expect(h.biggestAWin?.match_date).toBe('2020-01-01');
    expect(h.biggestBWin?.match_date).toBe('2021-09-26'); // 3-1 beats 2-0 on goals at the same margin
    expect(h.first?.match_date).toBe('1992-12-12');
  });

  it('finds the longest unbeaten runs, marking one still going', () => {
    expect(h.longestUnbeatenA).toEqual({ length: 4, from: '2022-10-01', to: '2024-04-28', ongoing: true });
    expect(h.longestUnbeatenB).toEqual({ length: 2, from: '2020-12-06', to: '2021-09-26', ongoing: false });
  });

  it('lists common scores from team A’s side and competitions', () => {
    expect(h.commonScores[0]).toEqual({ score: '0-2', count: 1 }); // all once: ordered by score
    expect(h.competitions).toEqual([{ name: 'Premier League', played: 7 }, { name: 'League Cup', played: 1 }]);
  });

  it('writes the sentence with the leader first and the start season', () => {
    expect(headToHeadSentence(h, 'Arsenal', 'Tottenham')).toBe('Arsenal have won 4 of 8 meetings with Tottenham since 1992/93, Tottenham 2, with 2 draws.');
    expect(headToHeadSentence(summariseHeadToHead(meetings, 2), 'Tottenham', 'Arsenal')).toBe('Arsenal have won 4 of 8 meetings with Tottenham since 1992/93, Tottenham 2, with 2 draws.');
  });
});

describe('seasonText', () => {
  it('expands two-year labels and leaves calendar years alone', () => {
    expect(seasonText('9293')).toBe('1992/93');
    expect(seasonText('9900')).toBe('1999/00');
    expect(seasonText('2627')).toBe('2026/27');
    expect(seasonText('2024')).toBe('2024');
  });
});
