// Unit tests for the International visuals: bracket order, titles race,
// competition filters and title lists.
import { describe, it, expect } from 'vitest';
import { bracketRounds, matchesFilter, pointsForWin, titleList, titleText, titlesRace, TOURNAMENTS, type EditionSummary, type IntlMatch } from '../lib/intlStats';

function g(key: string, stage: string, home: string, away: string, hs: number, as: number, date = '2024-07-01'): IntlMatch {
  return {
    match_key: key, match_date: date, home_team: home, home_slug: home.toLowerCase(), home_name: home, away_team: away, away_slug: away.toLowerCase(), away_name: away,
    home_score: hs, away_score: as, home_score_90: hs, away_score_90: as, went_extra_time: false, shootout_winner: null, competition: 'Copa América', competition_slug: 'copa-america',
    competition_kind: 'tournament', edition_key: 'COPA-2024', stage_code: stage, stage_name: stage, stage_type: 'knockout', group_label: null, matchday: null, city: null, country: null,
    neutral: true, elo_home_pre: 1800, elo_away_pre: 1800, elo_change: 0,
  };
}

function ed(competition: string, year: number, winner: string | null): EditionSummary {
  return { edition_key: `X-${year}`, competition, competition_slug: '', label: String(year), season_start: year, teams: 8, matches: 10, goals: 20, hosts: [], winner, winner_slug: winner?.toLowerCase() ?? null, runner_up: null, runner_up_slug: null, final_key: null, first_match: null, last_match: null } as EditionSummary;
}

describe('bracket', () => {
  it('orders each round so feeders sit beside the tie they lead to', () => {
    const games = [
      g('q1', 'QF', 'A', 'B', 1, 0), g('q2', 'QF', 'C', 'D', 2, 0), g('q3', 'QF', 'E', 'F', 0, 1), g('q4', 'QF', 'G', 'H', 3, 1),
      g('s1', 'SF', 'F', 'G', 1, 0, '2024-07-05'), g('s2', 'SF', 'A', 'C', 0, 1, '2024-07-05'),
      g('f', 'F', 'C', 'F', 1, 0, '2024-07-10'),
    ];
    const r = bracketRounds(games);
    expect(r.map((x) => x.code)).toEqual(['QF', 'SF', 'F']);
    expect(r[1].games.map((x) => x.match_key)).toEqual(['s2', 's1']);
    expect(r[0].games.map((x) => x.match_key)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('shows the replay of a replayed tie, and nothing without a final', () => {
    const games = [g('s1', 'SF', 'A', 'B', 1, 1), g('s1r', 'SF', 'B', 'A', 2, 0, '2024-07-03'), g('s2', 'SF', 'C', 'D', 1, 0), g('f', 'F', 'B', 'C', 1, 0, '2024-07-10')];
    expect(bracketRounds(games)[0].games.map((x) => x.match_key)).toEqual(['s1r', 's2']);
    expect(bracketRounds(games.filter((x) => x.stage_code !== 'F'))).toEqual([]);
  });
});

describe('titles', () => {
  it('race adds titles up year by year, null before the first', () => {
    const r = titlesRace([ed('Copa América', 1916, 'Uruguay'), ed('Copa América', 1919, 'Brazil'), ed('Copa América', 1920, 'Uruguay'), ed('Copa América', 2028, null)]);
    expect(r.years).toEqual([1916, 1919, 1920]);
    expect(r.series.find((s) => s.team === 'Uruguay')!.values).toEqual([1, 1, 2]);
    expect(r.series.find((s) => s.team === 'Brazil')!.values).toEqual([null, 1, 1]);
  });

  it('lists titles in tournament order and names them', () => {
    const list = titleList({ titles: { 'copa-america': 9, 'fifa-world-cup': 5, 'confederations-cup': 4 } });
    expect(list.map((x) => [x.tournament.slug, x.n])).toEqual([['world-cup', 5], ['copa-america', 9], ['confederations-cup', 4]]);
    expect(titleText(TOURNAMENTS[0], 1)).toBe('1 World Cup');
    expect(titleText(TOURNAMENTS[3], 7)).toBe('7 AFCONs');
    expect(titleList({ titles: null })).toEqual([]);
  });
});

describe('filters and points', () => {
  it('filters by competition kind; reported feed results count as Nations League', () => {
    expect(matchesFilter({ competition_kind: 'friendly' }, 'friendly')).toBe(true);
    expect(matchesFilter({ competition_kind: 'tournament' }, 'tournaments')).toBe(true);
    expect(matchesFilter({ competition_kind: 'reported' }, 'nations_league')).toBe(true);
    expect(matchesFilter({ competition_kind: 'qualifying' }, 'tournaments')).toBe(false);
  });

  it('two points for a win before the mid-1990s outside the World Cup too', () => {
    expect(pointsForWin('COPA-1959')).toBe(2);
    expect(pointsForWin('COPA-1995')).toBe(3);
    expect(pointsForWin('AFCON-1959-egypt')).toBe(2);
  });
});
