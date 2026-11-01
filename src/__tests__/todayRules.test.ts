// The Today page's rules (src/lib/todayApi.ts, todayFpl.ts, todayYours.ts).
import { describe, expect, it } from 'vitest';
import {
  biggestGap, comingUp, daySentence, favouriteCall, hiddenCompetitions, inPlay, isQuietDay, parseDayPage, resultCalls, slotGroups,
  slotSummary, strongestFavourites, ukInstant, type DayGame,
} from '../lib/todayApi';
import { count, deadlineLine, mostTransferred, overnightLine, squadFlags, teamNewsLine, tonightLine } from '../lib/todayFpl';
import { clubGame, ordinal, tableLine, whenLabel } from '../lib/todayYours';
import type { PriceChange, PriceRisk } from '../lib/priceRiskApi';
import type { ClubCard } from '../lib/myHomeApi';
import type { OpenGameweek } from '../lib/fplGameweekState';

let id = 0;
function game(over: Partial<DayGame> = {}): DayGame {
  id += 1;
  return {
    fixtureId: id, slug: `g-${id}`, leagueId: 1, league: 'Premier League', time: '15:00', status: 'scheduled', homeId: id * 10, awayId: id * 10 + 1,
    home: `Home ${id}`, away: `Away ${id}`, model: null, estimated: false, market: null, tv: [], notTv: false, hg: null, ag: null, confirmed: false, ...over,
  };
}

describe('parseDayPage', () => {
  it('maps the RPC shape, numbers and all', () => {
    const p = parseDayPage({
      day: '2026-10-31',
      games: [{ fixture_id: 80, slug: 'a-v-b', league_id: 1, league: 'Premier League', time: '20:00', status: 'played', home_id: 10, away_id: 32, home: 'Aston Villa', away: 'Fulham',
        model: { home: 0.5448, draw: 0.2447, away: 0.2105 }, estimated: false, market: { home: '0.4863', draw: 0.2537, away: 0.26 }, tv: ['Sky Sports'], not_tv: false, hg: 1, ag: 1, confirmed: false }],
      ahead: [{ date: '2026-11-01', league_id: 1, league: 'Premier League', games: 1 }],
      team_news: [{ slot: '2026-10-31T15:00:00+00:00', facts: { ready: true, games: [{ home: 'Man City', away: 'Brighton' }], not_starting: [{ id: 399, name: 'Cherki', team: 'Man City', own: 37, reason: null }], doubts_starting: [] } }],
    });
    expect(p.games[0]).toMatchObject({ fixtureId: 80, time: '20:00', market: { home: 0.4863 }, tv: ['Sky Sports'], hg: 1, ag: 1 });
    expect(p.ahead[0]).toEqual({ date: '2026-11-01', leagueId: 1, league: 'Premier League', games: 1 });
    expect(p.teamNews[0].notStarting[0]).toMatchObject({ name: 'Cherki', own: 37 });
  });
});

describe('favouriteCall', () => {
  const g = { home: 'Chelsea', away: 'Man Utd' };
  it('market favourite, ours in brackets when 5+ points apart on that side', () => {
    expect(favouriteCall({ ...g, market: { home: 0.52, draw: 0.25, away: 0.23 }, model: { home: 0.41, draw: 0.28, away: 0.31 } })).toEqual({ main: 'Chelsea 52%', ours: 'ours 41%', source: 'market' });
    expect(favouriteCall({ ...g, market: { home: 0.52, draw: 0.25, away: 0.23 }, model: { home: 0.5, draw: 0.25, away: 0.25 } }).ours).toBeNull();
  });
  it('names our favourite when it is the other side, and "level" when the market has them even', () => {
    expect(favouriteCall({ ...g, market: { home: 0.36, draw: 0.28, away: 0.36 }, model: { home: 0.45, draw: 0.27, away: 0.28 } })).toEqual({ main: 'Level, 36% each', ours: 'ours: Chelsea 45%', source: 'market' });
  });
  it('our model alone without a market; nothing without either', () => {
    expect(favouriteCall({ ...g, market: null, model: { home: 0.3, draw: 0.2, away: 0.5 } })).toEqual({ main: 'Man Utd 50%', ours: null, source: 'model' });
    expect(favouriteCall({ ...g, market: null, model: null }).main).toBe('');
  });
});

describe('slots', () => {
  it('one slot per afternoon time, the evening together, Premier League and TV first', () => {
    const games = [
      game({ time: '15:00', leagueId: 3, league: 'League One' }),
      game({ time: '15:00', leagueId: 1 }),
      game({ time: '12:30', leagueId: 2, league: 'Championship', tv: ['Sky Sports'] }),
      game({ time: '19:45', leagueId: 15, league: 'Serie A' }),
      game({ time: '17:30', leagueId: 1, tv: ['Sky Sports'] }),
    ];
    const slots = slotGroups(games);
    expect(slots.map((s) => s.label)).toEqual(['12:30', '15:00', 'Evening']);
    expect(slots[1].games[0].leagueId).toBe(1);
    expect(slots[2].games.map((x) => x.time)).toEqual(['17:30', '19:45']);
  });
  it('a followed club comes first in its slot', () => {
    const mine = game({ time: '15:00', leagueId: 5, league: 'National League', homeId: 999 });
    const slots = slotGroups([game({ time: '15:00' }), mine], new Set([999]));
    expect(slots[0].games[0]).toBe(mine);
  });
  it('summaries: TV counts, and the Saturday 3pm blackout', () => {
    const sat = slotGroups([game({ time: '15:00' }), game({ time: '15:00' })]);
    expect(slotSummary(sat[0], '2026-10-31')).toBe('2 games · no UK TV (3pm blackout)');
    expect(slotSummary(sat[0], '2026-11-03')).toBe('2 games · no UK TV');
    const mixed = slotGroups([game({ time: '12:30', tv: ['TNT Sports'] }), game({ time: '12:30' })]);
    expect(slotSummary(mixed[0], '2026-10-31')).toBe('2 games · 1 on UK TV');
  });
  it('names the hidden competitions, EFL runs as a range', () => {
    const hidden = [2, 3, 4, 5, 22].map((l) => game({ leagueId: l, league: ['', '', 'Championship', 'League One', 'League Two', 'National League'][l] ?? 'Scottish Premiership' }));
    expect(hiddenCompetitions(hidden)).toBe('Championship to National League, Scottish Premiership');
    expect(hiddenCompetitions([game({ leagueId: 15, league: 'Serie A' })])).toBe('Serie A');
  });
});

describe('worth knowing', () => {
  it('biggest gap: any outcome, 5+ points, never an estimated rating', () => {
    const a = game({ home: 'Barnsley', away: 'Oxford', market: { home: 0.35, draw: 0.26, away: 0.39 }, model: { home: 0.17, draw: 0.2, away: 0.63 } });
    const b = game({ market: { home: 0.1, draw: 0.1, away: 0.8 }, model: { home: 0.6, draw: 0.2, away: 0.2 }, estimated: true });
    const gap = biggestGap([game({ market: { home: 0.5, draw: 0.25, away: 0.25 }, model: { home: 0.52, draw: 0.24, away: 0.24 } }), a, b])!;
    expect(gap.game).toBe(a);
    expect(gap.outcome).toBe('away');
    expect(biggestGap([game({ market: { home: 0.5, draw: 0.25, away: 0.25 }, model: { home: 0.52, draw: 0.24, away: 0.24 } })])).toBeNull();
  });
  it('strongest favourites: market first, games still to play', () => {
    const favs = strongestFavourites([
      game({ home: 'Middlesbrough', away: 'Charlton', market: { home: 0.75, draw: 0.15, away: 0.1 } }),
      game({ home: 'X', away: 'Stockport', market: { home: 0.1, draw: 0.16, away: 0.74 } }),
      game({ home: 'Played', away: 'Y', market: { home: 0.9, draw: 0.05, away: 0.05 }, hg: 1, ag: 0 }),
      game({ home: 'Model only', away: 'Z', model: { home: 0.5, draw: 0.3, away: 0.2 } }),
    ]);
    expect(favs.map((f) => `${f.team} ${f.p}`)).toEqual(['Middlesbrough 0.75', 'Stockport 0.74', 'Model only 0.5']);
    expect(favs[2].source).toBe('model');
  });
});

describe('results and the day', () => {
  it('whether the market and our model had the result', () => {
    const g = game({ hg: 2, ag: 1, market: { home: 0.5, draw: 0.3, away: 0.2 }, model: { home: 0.3, draw: 0.3, away: 0.4 } });
    expect(resultCalls(g)).toEqual({ market: true, model: false });
    expect(resultCalls(game())).toEqual({ market: null, model: null });
  });
  it('quiet day: no Premier League game', () => {
    expect(isQuietDay([game({ leagueId: 2 })])).toBe(true);
    expect(isQuietDay([game({ leagueId: 1 })])).toBe(false);
    expect(isQuietDay([game({ leagueId: 1, status: 'postponed' })])).toBe(true);
  });
  it('the dated opening sentence', () => {
    const one = [game({ home: 'Liverpool', away: 'Arsenal', time: '16:30', tv: ['Sky Sports'] }), game({ leagueId: 15, time: '11:30', tv: ['DAZN'] }), game({ leagueId: 3, time: '14:00' })];
    expect(daySentence('2026-11-01', one)).toBe('Sunday 1 November 2026: 3 football matches today, 2 on UK TV; Liverpool v Arsenal at 16:30 is the Premier League game.');
    expect(daySentence('2026-10-31', [game({ time: '12:30' }), game({ time: '15:00' })])).toBe('Saturday 31 October 2026: 2 football matches today, 0 on UK TV; 2 Premier League games, from 12:30.');
    expect(daySentence('2026-11-03', [game({ leagueId: 2, time: '19:45' })])).toBe('Tuesday 3 November 2026: 1 football match today, 0 on UK TV; no Premier League game; the first kick-off is 19:45.');
    expect(daySentence('2026-11-10', [])).toBe('Tuesday 10 November 2026: no football matches in the competitions we cover today.');
  });
  it('UK wall-clock times, either side of the clocks changing', () => {
    expect(new Date(ukInstant('2026-10-31', '15:00')).toISOString()).toBe('2026-10-31T15:00:00.000Z');
    expect(new Date(ukInstant('2026-10-24', '15:00')).toISOString()).toBe('2026-10-24T14:00:00.000Z');
  });
  it('in play: kicked off, no score yet, within two hours', () => {
    const g = game({ time: '12:30' });
    expect(inPlay(g, '2026-10-31', Date.parse('2026-10-31T13:00:00Z'))).toBe(true);
    expect(inPlay(g, '2026-10-31', Date.parse('2026-10-31T12:00:00Z'))).toBe(false);
    expect(inPlay({ ...g, hg: 1, ag: 0 }, '2026-10-31', Date.parse('2026-10-31T13:00:00Z'))).toBe(false);
  });
  it('coming up: a line per day', () => {
    expect(comingUp([
      { date: '2026-11-04', leagueId: 9, league: 'UEFA Champions League', games: 9 },
      { date: '2026-11-04', leagueId: 2, league: 'Championship', games: 3 },
      { date: '2026-11-07', leagueId: 1, league: 'Premier League', games: 10 },
    ])).toEqual([{ date: '2026-11-04', text: 'Champions League 9 · Championship 3' }, { date: '2026-11-07', text: 'Premier League 10' }]);
  });
});

describe('FPL today', () => {
  const risk = (over: Partial<PriceRisk>): PriceRisk => ({
    fpl_player_id: 1, web_name: 'X', slug: null, team_name: null, position_label: 'MID', price: 5, ownership: 1, transfers_in: 0, transfers_out: 0,
    net_transfers: 0, pressure: 0, direction: 'steady', outlook: 'building', updated_at: '2026-10-31T12:17:00Z', ...over,
  });
  it('most bought and sold', () => {
    expect(mostTransferred([risk({ web_name: 'Jackson', transfers_in: 1970000 }), risk({ web_name: 'João Pedro', transfers_out: 2820000 })]))
      .toEqual({ inName: 'Jackson', inCount: 1970000, outName: 'João Pedro', outCount: 2820000 });
    expect(count(1970000)).toBe('1.97m');
    expect(count(2800000)).toBe('2.8m');
    expect(count(82000)).toBe('82k');
  });
  it('tonight: nobody past the line, or who is', () => {
    expect(tonightLine([risk({})])).toBe('Tonight: nobody past FPL’s line yet (checked 12:17).');
    expect(tonightLine([risk({ web_name: 'Rogers', outlook: 'expected', direction: 'rise' })])).toBe('Tonight, FPL expects Rogers to rise (checked 12:17).');
  });
  it('overnight changes from the night just gone only', () => {
    const c = (name: string, before: number, after: number, night = '2026-10-30'): PriceChange => ({ night, fpl_player_id: 1, web_name: name, slug: null, team_name: null, position_label: 'MID', price_before: before, price_after: after, ownership: null, progress: null });
    expect(overnightLine([c('Rogers', 8.0, 8.1), c('Delap', 5.5, 5.4)], '2026-10-31')).toBe('Up: Rogers £8.1m. Down: Delap £5.4m.');
    expect(overnightLine([c('Rogers', 8.0, 8.1, '2026-10-20')], '2026-10-31')).toBeNull();
  });
  it('deadline status', () => {
    const fmt = () => 'Friday 6 November, 18:30';
    const open = { state: { openGw: 9, nextGw: 10, showToggle: true, gamesRemaining: 6, defaultView: 'open' } } as OpenGameweek;
    expect(deadlineLine({ open, next: { gw: 10, deadline: '2026-11-06T18:30:00Z' } }, '2026-10-31', fmt)).toBe('Gameweek 9 is on. Gameweek 10 deadline: Friday 6 November, 18:30');
    expect(deadlineLine({ open: null, next: { gw: 10, deadline: '2026-11-06T18:30:00Z' } }, '2026-11-06', fmt)).toBe('Gameweek 10 deadline today, 18:30');
  });
  it('team news per slot', () => {
    expect(teamNewsLine({ slot: '2026-10-31T12:30:00Z', ready: true, games: [{ home: 'Chelsea', away: 'Man Utd' }], notStarting: [], doubtsStarting: [] }))
      .toBe('Chelsea v Man Utd: no player owned by 10%+ left out.');
    expect(teamNewsLine({ slot: '2026-10-31T15:00:00Z', ready: false, games: [], notStarting: [], doubtsStarting: [] })).toBe('15:00 line-ups from about 14:00.');
    expect(teamNewsLine({ slot: '2026-10-31T15:00:00Z', ready: true, games: [{ home: 'A', away: 'B' }, { home: 'C', away: 'D' }], notStarting: [{ id: 1, name: 'Cherki', team: 'Man City', own: 37 }, { id: 2, name: 'Guéhi', team: 'Man City', own: 17 }], doubtsStarting: [] }))
      .toBe('15:00 (2 games): Cherki (Man City, 37%) and Guéhi (Man City, 17%) not starting.');
  });
  it('flags in your squad', () => {
    const inj = [{ fpl_player_id: 5, web_name: 'Saka', slug: null, team_id: 1, team_name: 'Arsenal', position_label: 'MID', price: 10, ownership: 40, total_points: 40, status: 'd', chance_next_round: 75, news: 'Knock', return_date: null, fixtures_missed: null, next_fixture_date: null }];
    expect(squadFlags([5, 6], inj)).toEqual([{ name: 'Saka', team: 'Arsenal', status: 'Doubtful', chance: 75, news: 'Knock' }]);
    expect(squadFlags([6], inj)).toEqual([]);
  });
});

describe('Yours today', () => {
  const card: ClubCard = {
    team: { teamId: 70, name: 'Southend', slug: 'southend' },
    league: { leagueId: 5, name: 'National League', slug: 'national-league' },
    next: { fixtureId: 9, slug: 'n', date: '2026-11-07', time: '15:00:00', league: 'National League', home: 'Southend', away: 'York', isHome: true, model: { home: 0.5, draw: 0.25, away: 0.25 }, market: null },
    recent: [],
    table: [
      { position: 2, teamId: 10, name: 'Harrogate', slug: 'h', played: 13, gd: 9, points: 30 },
      { position: 3, teamId: 70, name: 'Southend', slug: 'southend', played: 13, gd: 9, points: 27 },
    ],
  };
  it('the table line', () => {
    expect(tableLine(card)).toBe('Southend are 3rd, 3 points behind Harrogate in 2nd.');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(12)).toBe('12th');
  });
  it("today's game when the club plays today, else the card's next game", () => {
    const today = game({ homeId: 1, awayId: 70, home: 'Wealdstone', away: 'Southend', time: '15:00', tv: [] });
    expect(clubGame(70, '2026-10-31', [today], card.next)).toMatchObject({ home: 'Wealdstone', isHome: false, date: '2026-10-31' });
    expect(clubGame(70, '2026-10-31', [], card.next)).toMatchObject({ away: 'York', time: '15:00' });
  });
  it('when', () => {
    expect(whenLabel('2026-10-31', '15:00', '2026-10-31')).toBe('Today 15:00');
    expect(whenLabel('2026-11-01', '16:30', '2026-10-31')).toBe('Tomorrow 16:30');
    expect(whenLabel('2026-11-07', null, '2026-10-31')).toBe('Sat 7 Nov');
  });
});
