// The Today page (/today): personal and no-prefs, match day and quiet day.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TodayPage from '../pages/TodayPage';
import { EMPTY_PREFS, savePrefs } from '../lib/myPrefs';
import type { DayPage, DayGame } from '../lib/todayApi';
import type { ClubCard } from '../lib/myHomeApi';
import type { FplToday } from '../lib/todayFpl';

vi.mock('../lib/todayApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/todayApi')>('../lib/todayApi')),
  getDayPage: vi.fn(),
}));
vi.mock('../lib/todayFpl', async () => ({
  ...(await vi.importActual<typeof import('../lib/todayFpl')>('../lib/todayFpl')),
  getFplToday: vi.fn(),
  getSquadFlags: vi.fn(),
}));
vi.mock('../lib/myHomeApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/myHomeApi')>('../lib/myHomeApi')),
  getMyClubCards: vi.fn(),
  getIntlCard: vi.fn(),
}));
vi.mock('../lib/nflApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/nflApi')>('../lib/nflApi')),
  loadNflUpcoming: vi.fn(),
}));

import { getDayPage } from '../lib/todayApi';
import { getFplToday, getSquadFlags } from '../lib/todayFpl';
import { getMyClubCards } from '../lib/myHomeApi';
import { loadNflUpcoming } from '../lib/nflApi';

let id = 0;
function g(over: Partial<DayGame>): DayGame {
  id += 1;
  return {
    fixtureId: id, slug: `m-${id}`, leagueId: 1, league: 'Premier League', time: '15:00', status: 'scheduled', homeId: id * 10, awayId: id * 10 + 1,
    home: `Home ${id}`, away: `Away ${id}`, model: null, estimated: false, market: null, tv: [], notTv: false, hg: null, ag: null, confirmed: false, ...over,
  };
}

// Saturday 31 October 2026, 13:45 UK (GMT).
const MATCH_DAY = '2026-10-31';
function matchDay(): DayPage {
  const efl = Array.from({ length: 8 }, (_, i) => g({ leagueId: 3, league: 'League One', time: '15:00', home: `L1 home ${i}`, away: `L1 away ${i}`, market: { home: 0.4, draw: 0.3, away: 0.3 } }));
  return {
    day: MATCH_DAY,
    games: [
      g({ time: '12:30', home: 'Chelsea', away: 'Man Utd', tv: ['TNT Sports'], market: { home: 0.52, draw: 0.25, away: 0.23 }, model: { home: 0.41, draw: 0.28, away: 0.31 } }),
      g({ time: '12:30', leagueId: 2, league: 'Championship', home: 'Norwich', away: 'Watford', tv: ['Sky Sports'], market: { home: 0.61, draw: 0.22, away: 0.17 }, hg: 2, ag: 0, model: { home: 0.55, draw: 0.25, away: 0.2 } }),
      g({ time: '15:00', home: 'Man City', away: 'Brighton', market: { home: 0.58, draw: 0.22, away: 0.2 }, model: { home: 0.6, draw: 0.2, away: 0.2 } }),
      g({ time: '15:00', leagueId: 2, league: 'Championship', home: 'Barnsley', away: 'Oxford', market: { home: 0.35, draw: 0.26, away: 0.39 }, model: { home: 0.17, draw: 0.2, away: 0.63 } }),
      g({ time: '15:00', leagueId: 5, league: 'National League', home: 'Wealdstone', away: 'Southend', homeId: 900, awayId: 70, market: { home: 0.25, draw: 0.22, away: 0.53 }, model: { home: 0.24, draw: 0.21, away: 0.55 } }),
      ...efl,
      g({ time: '17:30', home: 'Tottenham', away: 'Crystal Palace', tv: ['Sky Sports'], market: { home: 0.61, draw: 0.2, away: 0.19 }, model: { home: 0.42, draw: 0.28, away: 0.3 } }),
    ],
    ahead: [],
    teamNews: [{ slot: '2026-10-31T12:30:00Z', ready: true, games: [{ home: 'Chelsea', away: 'Man Utd' }], notStarting: [], doubtsStarting: [] }],
  };
}

const QUIET_DAY = '2026-11-03';
function quietDay(): DayPage {
  return {
    day: QUIET_DAY,
    games: [
      g({ time: '19:45', leagueId: 2, league: 'Championship', home: 'QPR', away: 'Burnley', model: { home: 0.52, draw: 0.25, away: 0.23 } }),
      g({ time: '20:00', leagueId: 2, league: 'Championship', home: 'West Brom', away: 'Southampton', model: { home: 0.27, draw: 0.24, away: 0.49 } }),
    ],
    ahead: [{ date: '2026-11-04', leagueId: 2, league: 'Championship', games: 3 }, { date: '2026-11-07', leagueId: 1, league: 'Premier League', games: 10 }],
    teamNews: [],
  };
}
function yesterday(): DayPage {
  return { day: '2026-11-02', games: [g({ time: '20:00', home: 'Everton', away: 'Leeds', hg: 1, ag: 1, confirmed: true, market: { home: 0.45, draw: 0.28, away: 0.27 }, model: { home: 0.33, draw: 0.34, away: 0.33 } })], ahead: [], teamNews: [] };
}

const fpl: FplToday = {
  open: { state: { openGw: 9, nextGw: 10, showToggle: true, gamesRemaining: 6, defaultView: 'open' }, games: [], topScorers: [], mostCaptained: null, mostSelected: null },
  next: { gw: 10, deadline: '2026-11-06T18:30:00Z' },
  risk: [
    { fpl_player_id: 1, web_name: 'N.Jackson', slug: null, team_name: null, position_label: 'FWD', price: 7, ownership: 23.7, transfers_in: 1970000, transfers_out: 0, net_transfers: 0, pressure: 0, direction: 'steady', outlook: 'building', updated_at: '2026-10-31T12:17:00Z' },
    { fpl_player_id: 2, web_name: 'João Pedro', slug: null, team_name: null, position_label: 'FWD', price: 7, ownership: 20, transfers_in: 0, transfers_out: 2820000, net_transfers: 0, pressure: 0, direction: 'steady', outlook: 'building', updated_at: '2026-10-31T12:17:00Z' },
  ],
  changes: [{ night: '2026-10-30', fpl_player_id: 3, web_name: 'Rogers', slug: null, team_name: null, position_label: 'MID', price_before: 8.0, price_after: 8.1, ownership: null, progress: null }],
};

const southend: ClubCard = {
  team: { teamId: 70, name: 'Southend', slug: 'southend' },
  league: { leagueId: 5, name: 'National League', slug: 'national-league' },
  next: null,
  recent: [],
  table: [
    { position: 2, teamId: 10, name: 'Harrogate', slug: 'h', played: 13, gd: 9, points: 30 },
    { position: 3, teamId: 70, name: 'Southend', slug: 'southend', played: 13, gd: 9, points: 27 },
  ],
};
const arsenal: ClubCard = {
  team: { teamId: 5, name: 'Arsenal', slug: 'arsenal' }, league: null, recent: [], table: [],
  next: { fixtureId: 99, slug: 'liv-ars', date: '2026-11-01', time: '16:30:00', league: 'Premier League', home: 'Liverpool', away: 'Arsenal', isHome: false, model: { home: 0.33, draw: 0.22, away: 0.45 }, market: null, tv: 'Sky Sports' },
};

function renderAt(path = '/today') {
  return render(<MemoryRouter initialEntries={[path]}><TodayPage /></MemoryRouter>);
}

describe('Today page', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T13:45:00Z'));
    vi.mocked(getDayPage).mockReset().mockImplementation(async (day: string) => (day === MATCH_DAY ? matchDay() : day === QUIET_DAY ? quietDay() : yesterday()));
    vi.mocked(getFplToday).mockReset().mockResolvedValue(fpl);
    vi.mocked(getSquadFlags).mockReset().mockResolvedValue({ team: 'X', flags: [] });
    vi.mocked(getMyClubCards).mockReset().mockResolvedValue([southend, arsenal]);
    vi.mocked(loadNflUpcoming).mockReset().mockResolvedValue(null);
  });
  afterEach(() => vi.useRealTimers());

  it('match day, no preferences: a compact "choose your teams" line, then the day', async () => {
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: 'Saturday 31 October' })).toBeInTheDocument();
    const empty = screen.getByTestId('today-yours-empty');
    expect(within(empty).getByRole('link', { name: 'Choose your teams' })).toHaveAttribute('href', '/my');
    expect(getMyClubCards).not.toHaveBeenCalled();

    expect(await screen.findByTestId('today-lead')).toHaveTextContent('Saturday 31 October 2026: 14 football matches today, 3 on UK TV; 3 Premier League games, from 12:30.');
    expect(screen.getByTestId('today-page')).toHaveAttribute('data-layout', 'match-day');

    // Slots, with the market's favourite and ours in brackets.
    const on = screen.getByTestId('today-on');
    const slots = within(on).getAllByTestId('today-slot');
    expect(slots[0]).toHaveTextContent('12:30 · in play');
    expect(slots[0]).toHaveTextContent('Chelsea 52% (ours 41%)');
    expect(slots[0]).toHaveTextContent('TNT Sports');
    // 15:00: 11 games, five shown, the rest behind "+6 more".
    expect(slots[1]).toHaveTextContent('11 games · no UK TV (3pm blackout)');
    expect(within(slots[1]).getAllByTestId('today-game')).toHaveLength(5);
    fireEvent.click(within(slots[1]).getByRole('button', { name: /\+6 more at 15:00/ }));
    expect(within(slots[1]).getAllByTestId('today-game')).toHaveLength(11);
    expect(slots[2]).toHaveTextContent('Evening');
    expect(slots[2]).toHaveTextContent('Tottenham 61% (ours 42%)');

    // Filters.
    fireEvent.click(within(on).getByRole('button', { name: 'On TV' }));
    expect(within(on).getByRole('button', { name: 'On TV' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(on).getAllByTestId('today-game')).toHaveLength(3);
    fireEvent.click(within(on).getByRole('button', { name: 'Premier League' }));
    expect(within(on).getAllByTestId('today-game').map((r) => r.textContent)).toEqual([
      expect.stringContaining('Chelsea v Man Utd'), expect.stringContaining('Man City v Brighton'), expect.stringContaining('Tottenham v Crystal Palace'),
    ]);

    // Results so far, with whether the market and our model had it.
    const results = screen.getByTestId('today-results');
    expect(results).toHaveTextContent('Norwich 2–0 Watford');
    expect(within(results).getAllByText('had it right')).toHaveLength(2);

    // Worth knowing: the biggest gap and the favourites, "not a tip".
    expect(screen.getByTestId('today-gap')).toHaveTextContent('Market: Oxford 39%. Our model: Oxford 63%.');
    expect(screen.getByTestId('today-favourites')).toHaveTextContent('Tottenham 61% v Crystal Palace');
    expect(screen.getByTestId('today-worth-knowing')).toHaveTextContent('Not a tip');

    // FPL today.
    const f = await screen.findByTestId('today-fpl');
    expect(await within(f).findByText(/Most bought: N.Jackson \(\+1.97m\)/)).toBeInTheDocument();
    expect(f).toHaveTextContent('Chelsea v Man Utd: no player owned by 10%+ left out.');
    expect(f).toHaveTextContent('Up: Rogers £8.1m.');
    expect(f).toHaveTextContent('Tonight: nobody past FPL’s line yet (checked 12:17).');
    expect(screen.getByTestId('today-lead')).toHaveTextContent('FPL Gameweek 9 is live.');
  });

  it('match day with a club and followed teams: your game first, with ours and the market', async () => {
    savePrefs({ ...EMPTY_PREFS, club: { teamId: 70, name: 'Southend', slug: 'southend' }, followed: [{ teamId: 5, name: 'Arsenal', slug: 'arsenal' }] });
    renderAt();
    const club = await screen.findByTestId('today-my-club');
    await within(club).findByText('Wealdstone v Southend');
    expect(club).toHaveTextContent('National League · Today 15:00');
    expect(club).toHaveTextContent('55%');
    expect(club).toHaveTextContent('Our model. The market has Southend 53%. Southend are 3rd, 3 points behind Harrogate in 2nd.');
    const following = screen.getByTestId('today-my-following');
    expect(following).toHaveTextContent('Also following · not today');
    expect(following).toHaveTextContent('Tomorrow 16:30: Liverpool v Arsenal, Sky Sports. We give Arsenal 45%.');
    expect(screen.queryByTestId('today-yours-empty')).not.toBeInTheDocument();
  });

  it('quiet weekday: Tonight, yesterday’s results, coming up', async () => {
    vi.setSystemTime(new Date('2026-11-03T09:00:00Z'));
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: 'Tuesday 3 November' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Tonight' })).toBeInTheDocument();
    expect(screen.getByTestId('today-page')).toHaveAttribute('data-layout', 'quiet');
    expect(screen.getByTestId('today-on')).toHaveTextContent('Our model’s favourite. The market’s view is added once prices are in');
    expect(screen.getByTestId('today-on')).toHaveTextContent('Southampton 49%');
    const y = await screen.findByTestId('today-yesterday-list');
    expect(y).toHaveTextContent('Everton 1–1 Leeds');
    expect(within(y).getAllByText('had it wrong')).toHaveLength(1);
    expect(within(y).getAllByText('had it right')).toHaveLength(1);
    const next = screen.getByTestId('today-coming-up');
    expect(within(next).getByRole('link', { name: 'Wednesday' })).toHaveAttribute('href', '/today?date=2026-11-04');
    expect(next).toHaveTextContent('Saturday: Premier League 10');
    expect(screen.queryByTestId('today-results')).not.toBeInTheDocument();
  });

  it('another day: games only, with Yesterday and Tomorrow links', async () => {
    renderAt('/today?date=2026-11-03');
    expect(screen.getByRole('heading', { level: 1, name: 'Tuesday 3 November' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Games' })).toBeInTheDocument();
    expect(screen.queryByTestId('today-yours-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-fpl')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Yesterday' })).toHaveAttribute('href', '/today?date=2026-11-02');
    expect(screen.getByRole('link', { name: 'Tomorrow →' })).toHaveAttribute('href', '/today?date=2026-11-04');
  });
});
