import { describe, expect, it } from 'vitest';
import { intlEditionFromBulk, intlTeamFromBulk, type IntlBulk } from '../lib/intlStatic';
import type { EditionSummary, IntlMatch, TeamSummary } from '../lib/intlStats';

const team = (team: string, slug: string) => ({ team, slug, confederation: 'UEFA', played: 40 }) as unknown as TeamSummary;
const match = (key: string, date: string, home: string, away: string, edition: string | null) =>
  ({ match_key: key, match_date: date, home_slug: home, away_slug: away, edition_key: edition }) as unknown as IntlMatch;
const wc = { edition_key: 'WC-2022', competition: 'FIFA World Cup', label: '2022', season_start: '2022-11-20' } as unknown as EditionSummary;

const bulk: IntlBulk = {
  teams: [team('Wales', 'wales'), team('England', 'england')],
  matches: [match('b', '2022-11-29', 'wales', 'england', 'WC-2022'), match('a', '2020-01-01', 'england', 'wales', null), match('c', '2022-11-21', 'england', 'iran', 'WC-2022')],
  fixtures: [],
  totals: [{ team: 'England', competition: 'FIFA World Cup' } as never],
  pairs: [{ team_a: 'England', team_b: 'Wales' } as never, { team_a: 'Iran', team_b: 'Wales' } as never],
  editions: [wc],
  goals: [
    { match_key: 'b', seq: 2, team: 'England', scorer: 'Foden', minute: 51, own_goal: false, penalty: false },
    { match_key: 'b', seq: 1, team: 'England', scorer: 'Rashford', minute: 50, own_goal: false, penalty: false },
    { match_key: 'a', seq: 1, team: 'England', scorer: 'Own', minute: 3, own_goal: true, penalty: false },
  ],
  squads: [],
  squadPlayers: [],
  groupOdds: [],
  stages: [{ stage_key: 's2', edition_key: 'WC-2022', code: 'R16', name: 'Last 16', type: 'knockout', stage_order: 2 }, { stage_key: 's1', edition_key: 'WC-2022', code: 'G', name: 'Groups', type: 'round_robin', stage_order: 1 }],
  groups: [],
};

describe('international pages from one bulk read (static build)', () => {
  it('a nation: its games in date order, its pairs, its own goals excluded', () => {
    const d = intlTeamFromBulk(bulk, 'england')!;
    expect(d.matches.map((m) => m.match_key)).toEqual(['a', 'c', 'b']);
    expect(d.pairs).toHaveLength(1);
    expect(d.goals.map((g) => g.scorer)).toEqual(['Rashford', 'Foden']);
    expect(d.teams.map((t) => t.team)).toEqual(['England', 'Wales']);
    expect(intlTeamFromBulk(bulk, 'nowhere')).toBeNull();
  });

  it('an edition: its games, stages in order, goals of its games only', () => {
    const d = intlEditionFromBulk(bulk, 'world-cup', '2022')!;
    expect(d.matches.map((m) => m.match_key)).toEqual(['c', 'b']);
    expect(d.stages.map((s) => s.code)).toEqual(['G', 'R16']);
    expect(d.goals).toHaveLength(2);
    expect(intlEditionFromBulk(bulk, 'world-cup', '1930')).toBeNull();
    expect(intlEditionFromBulk(bulk, 'nope', '2022')).toBeNull();
  });
});
