// Tennis phase 3: tournaments, draws, paths, TV guide, form grids, races, country filter.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/tennisApi';
import {
  ageOn,
  buildDraw,
  countryCounts,
  countryName,
  eventRows,
  eventSummary,
  finalPaths,
  flag,
  guideGroups,
  slamGrid,
  slamRace,
  surfaceGrid,
  titlesRace,
  weekStart,
  type CalendarRow,
  type FinalLite,
  type TennisEdition,
  type TennisEvent,
} from '../lib/tennisEvents';
import type { TennisMatch, TennisPlayer } from '../lib/tennisStats';
import TennisPlayersPage from '../pages/tennis/TennisPlayersPage';
import TennisTournamentsPage from '../pages/tennis/TennisTournamentsPage';
import TennisEditionPage from '../pages/tennis/TennisEditionPage';
import TennisTvGuidePage from '../pages/tennis/TennisTvGuidePage';
import TennisPlayerPage from '../pages/tennis/TennisPlayerPage';
import { activeSince, parseStatus } from '../lib/tennisStats';
import { renderTennisEditionPage, renderTennisEventPage, renderTennisTournamentsPage, renderTennisTvGuidePage } from '../entry-server';

vi.mock('../lib/tennisApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/tennisApi');
  return { ...actual, loadTennisPlayers: vi.fn(), loadTennisPlayer: vi.fn(), loadTennisTournaments: vi.fn(), loadTennisEdition: vi.fn(), loadTennisGuide: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

let n = 0;
const ROUNDS: Record<number, string> = { 1: '1st Round', 5: 'Quarterfinals', 6: 'Semifinals', 7: 'The Final' };
function m(w: number, l: number, ro: number, over: Partial<TennisMatch> = {}): TennisMatch {
  n++;
  return {
    source_key: `k${n}`, tour: 'ATP', year: 2025, match_date: `2025-07-${String(ro + 1).padStart(2, '0')}`, tournament_id: 9, tournament: 'Wimbledon', tournament_slug: 'wimbledon',
    location: 'London', surface_group: 'Grass', level: 'Grand Slam', level_rank: 1, round: ROUNDS[ro], round_order: ro, best_of: 5,
    winner: `P${w}`, winner_slug: `p${w}`, winner_id: w, loser: `P${l}`, loser_slug: `p${l}`, loser_id: l, w_rank: w, l_rank: l,
    w_games: [6, 6, 6], l_games: [3, 3, 3], result: 'Completed', played: true, avg_w: 1.4, avg_l: 3, b365_w: null, b365_l: null, ps_w: null, ps_l: null, ...over,
  };
}
// An 8-player draw: QF, SF, F (+ one first-round match listed under the bracket).
const edition = [
  m(9, 10, 1),
  m(1, 8, 5), m(4, 5, 5), m(3, 6, 5), m(2, 7, 5),
  m(1, 4, 6), m(2, 3, 6, { avg_w: 3.2, avg_l: 1.3 }),
  m(1, 2, 7),
];

const ev: TennisEvent = { event_id: 1, tour: 'ATP', slug: 'wimbledon', name: 'Wimbledon', city: 'London', country: 'GB', level: 'Grand Slam', level_rank: 1, surface: 'Grass', first_year: 2024, last_year: 2025, editions: 2 };
const ed = (year: number, winner: number, runner: number, over: Partial<TennisEdition> = {}): TennisEdition => ({
  tournament_id: 9, year, event_id: 1, event_slug: 'wimbledon', tour: 'ATP', name: 'Wimbledon', city: 'London', start_date: `${year}-06-30`, end_date: `${year}-07-13`,
  level: 'Grand Slam', level_rank: 1, surface: 'Grass', matches: 127, winner: `P${winner}`, winner_slug: `p${winner}`, runner_up: `P${runner}`, runner_up_slug: `p${runner}`, ...over,
});

describe('tennis phase 3 builders', () => {
  it('rebuilds the draw from the final back, winners first, earlier rounds listed', () => {
    const d = buildDraw(edition, 3)!;
    expect(d.rounds).toEqual(['Quarterfinals', 'Semifinals', 'The Final']);
    expect(d.slots[2][0]!.winner).toBe('P1');
    expect(d.slots[1].map((x) => x!.winner)).toEqual(['P1', 'P2']);
    expect(d.slots[0].map((x) => x!.winner)).toEqual(['P1', 'P4', 'P2', 'P3']);
    expect(d.gaps).toBe(0);
    expect(d.earlier.map((r) => r.round)).toEqual(['1st Round']);
    // A missing feeder shows as a gap, not a wrong match.
    expect(buildDraw(edition.filter((x) => !(x.round_order === 5 && x.winner_id === 4)), 3)!.gaps).toBe(1);
  });

  it('paths to the final: champion first, opponents, odds and route difficulty', () => {
    const [champ, runner] = finalPaths(edition);
    expect(champ.name).toBe('P1');
    expect(champ.champion).toBe(true);
    expect(champ.steps.map((s) => s.opponent)).toEqual(['P8', 'P4', 'P2']);
    expect(champ.avgOpponentRank).toBe(5);
    expect(champ.topOpponents).toBe(3);
    expect(runner.steps[runner.steps.length - 1].won).toBe(false);
  });

  it('event rows and summary: most titles, latest champion, longest run', () => {
    const eds = [ed(2024, 1, 2), ed(2025, 1, 3)];
    const [row] = eventRows([ev], eds);
    expect(row.top).toMatchObject({ name: 'P1', titles: 2, finals: 2, years: [2024, 2025] });
    expect(row.latest?.year).toBe(2025);
    const s = eventSummary(eds, edition);
    expect(s.bestRun).toMatchObject({ name: 'P1', wins: 3 });
  });

  it('countries: names, flags, counts and ages', () => {
    expect(countryName('GB')).toBe('United Kingdom');
    expect(flag('gb')).toBe('🇬🇧');
    expect(flag(null)).toBe('');
    expect(countryCounts([{ country: 'ES' }, { country: 'IT' }, { country: 'ES' }, { country: null }])[0]).toMatchObject({ code: 'ES', n: 2 });
    expect(ageOn('2001-08-16', '2026-08-15')).toBe(24);
    expect(ageOn('2001-08-16', '2026-08-16')).toBe(25);
  });

  it('Grand Slam grid and surface grid from a player\'s matches', () => {
    const g = slamGrid(edition, 1);
    expect(g.cells[2025].Wimbledon).toMatchObject({ reached: 'W', champion: true, won: 3, lost: 0 });
    expect(g.totals.Wimbledon).toMatchObject({ titles: 1, best: 'W' });
    expect(slamGrid(edition, 3).cells[2025].Wimbledon?.reached).toBe('SF');
    const s = surfaceGrid(edition, 2);
    expect(s.surfaces).toEqual(['Grass']);
    expect(s.cells[2025].Grass).toMatchObject({ won: 2, lost: 1 });
  });

  it('TV guide groups: under way from results, then by usual start week', () => {
    expect(weekStart('2026-10-08')).toBe('2026-10-05');
    const cal = (event_id: number, start: string, end: string): CalendarRow => ({
      event_id, tour: 'ATP', slug: `e${event_id}`, name: `E${event_id}`, city: 'X', country: 'CN', level: '250', level_rank: 6, surface: 'Hard',
      usual_start: start, usual_end: end, last_year: 2025, last_winner: null, last_winner_slug: null, channel: 'Sky Sports', free_to_air: null,
    });
    const g = guideGroups(
      [cal(1, '2026-10-05', '2026-10-11'), cal(8, '2027-10-04', '2027-10-10'), cal(2, '2026-10-12', '2026-10-18'), cal(3, '2026-11-09', '2026-11-15'), cal(4, '2026-12-28', '2027-01-03'), cal(5, '2026-10-06', '2026-10-12')],
      [{ ...ed(2026, 1, 2), event_id: 5, winner: null, winner_slug: null, start_date: '2026-10-02', end_date: '2026-10-07' }, { ...ed(2026, 1, 2), event_id: 6, winner: null, winner_slug: null }],
      '2026-10-08'
    );
    expect(g.underWay.map((e) => e.event_id)).toEqual([5]);
    expect(g.thisWeek.map((c) => c.event_id)).toEqual([1, 8]);
    expect(g.thisWeek[1].usual_start).toBe('2026-10-05');
    expect(g.nextWeek.map((c) => c.event_id)).toEqual([2]);
    expect(g.later.map((c) => c.event_id)).toEqual([3]);
  });

  it('races: cumulative titles per season and per Slam, from the chosen start', () => {
    const f = (year: number, who: string, level: FinalLite['level'], tournament = 'Open'): FinalLite => ({ year, date: `${year}-07-01`, tournament, level, winner: who, winnerSlug: who.toLowerCase() });
    const finals = [f(2020, 'A', '250'), f(2021, 'A', 'Grand Slam', 'Wimbledon'), f(2021, 'B', '1000'), f(2022, 'B', 'Grand Slam', 'US Open'), f(2022, 'B', '500')];
    const all = titlesRace(finals, 2021, 2022);
    expect(all.frames).toEqual(['2021', '2022']);
    expect(all.series.find((s) => s.name === 'A')!.values).toEqual([1, 1]);
    expect(all.series.find((s) => s.name === 'B')!.values).toEqual([1, 3]);
    expect(titlesRace(finals, 2020, 2022, 'big').series.find((s) => s.name === 'A')!.values).toEqual([null, 1, 1]);
    const slams = slamRace(finals, 2020, 2022);
    expect(slams.frames).toEqual(['Wimbledon 2021', 'US Open 2022']);
    expect(slams.series.find((s) => s.name === 'B')!.values).toEqual([null, 1]);
  });
});

const player = (over: Partial<TennisPlayer>): TennisPlayer => ({
  player_id: 1, tour: 'ATP', name: 'Sinner J.', slug: 'sinner-j', won: 300, lost: 80, titles: 20, finals: 25,
  first_year: 2019, last_year: 2026, last_match: '2026-09-29', recent_matches: 200, country: 'IT', full_name: 'Jannik Sinner', birth_date: '2001-08-16', hand: 'Right', ...over,
});

describe('playing status', () => {
  it('active means a match in the year before the latest in the data', () => {
    expect(activeSince([{ last_match: '2026-09-29' }, { last_match: '2020-01-01' }])).toBe('2025-09-29');
    expect(activeSince([])).toBeNull();
    expect([parseStatus(null), parseStatus('all'), parseStatus('nonsense')]).toEqual(['active', 'all', 'active']);
  });
});

describe('tennis phase 3 pages', () => {
  it('Your Player: active players by default; inactive, all, and a name search looks through everyone', async () => {
    mocked.loadTennisPlayers.mockResolvedValue({
      tour: 'ATP',
      players: [
        player({}),
        player({ player_id: 2, name: 'Federer R.', slug: 'federer-r', country: 'CH', last_match: '2021-07-07', recent_matches: 0 }),
        player({ player_id: 3, name: 'Injured X.', slug: 'injured-x', country: 'IT', last_match: '2025-10-01', recent_matches: 40 }),
      ],
    });
    render(<MemoryRouter initialEntries={['/tennis/players']}><Routes><Route path="/tennis/players" element={<TennisPlayersPage />} /></Routes></MemoryRouter>);
    const status = await screen.findByTestId('tennis-status-filter');
    const names = () => within(screen.getByTestId('tennis-players-table')).getAllByRole('link').map((a) => a.textContent).sort();
    // Active: a match since 29 Sep 2025, a year before the latest (29 Sep 2026).
    expect(names()).toEqual(['Injured X.', 'Sinner J.']);
    expect(within(screen.getByTestId('tennis-country-filter')).getAllByRole('option').map((o) => o.textContent)).toEqual(['All countries', 'Italy (2)']);
    fireEvent.change(status, { target: { value: 'inactive' } });
    expect(names()).toEqual(['Federer R.']);
    fireEvent.change(status, { target: { value: 'all' } });
    expect(names()).toEqual(['Federer R.', 'Injured X.', 'Sinner J.']);
    fireEvent.change(status, { target: { value: 'active' } });
    fireEvent.change(screen.getByTestId('tennis-player-search'), { target: { value: 'fed' } });
    expect(names()).toEqual(['Federer R.']);
  });

  it('Your Player: filter by country, kept in the URL', async () => {
    mocked.loadTennisPlayers.mockResolvedValue({
      tour: 'ATP',
      players: [player({}), player({ player_id: 2, name: 'Alcaraz C.', slug: 'alcaraz-c', country: 'ES' }), player({ player_id: 3, name: 'Musetti L.', slug: 'musetti-l', country: 'IT' })],
    });
    render(<MemoryRouter initialEntries={['/tennis/players']}><Routes><Route path="/tennis/players" element={<TennisPlayersPage />} /></Routes></MemoryRouter>);
    const filter = await screen.findByTestId('tennis-country-filter');
    expect(within(filter).getAllByRole('option').map((o) => o.textContent)).toEqual(['All countries', 'Italy (2)', 'Spain (1)']);
    fireEvent.change(filter, { target: { value: 'IT' } });
    const names = within(screen.getByTestId('tennis-players-table')).getAllByRole('link').map((a) => a.textContent);
    expect(names.sort()).toEqual(['Musetti L.', 'Sinner J.']);
  });

  it('a player page shows country, age and hand, and the Grand Slam grid links each run', async () => {
    mocked.loadTennisPlayer.mockResolvedValue(api.buildTennisPlayer(player({ player_id: 1, name: 'P1', slug: 'p1' }), edition));
    render(<MemoryRouter initialEntries={['/tennis/players/atp/p1']}><Routes><Route path="/tennis/players/:tour/:slug" element={<TennisPlayerPage />} /></Routes></MemoryRouter>);
    const bio = await screen.findByTestId('tennis-player-bio');
    expect(bio).toHaveTextContent('Jannik Sinner');
    expect(bio).toHaveTextContent('Italy');
    expect(bio).toHaveTextContent('right-handed');
    expect(within(screen.getByTestId('tennis-slam-grid')).getByRole('link', { name: 'W' }).getAttribute('href')).toBe('/tennis/tournaments/atp/wimbledon/2025');
  });

  it('Tournaments: search and level filter', async () => {
    const miami: TennisEvent = { ...ev, event_id: 2, slug: 'miami', name: 'Miami Open', city: 'Miami', country: 'US', level: '1000', level_rank: 3, surface: 'Hard' };
    mocked.loadTennisTournaments.mockResolvedValue(api.buildTournaments('ATP', [ev, miami], [ed(2025, 1, 2), { ...ed(2025, 3, 4), event_id: 2, event_slug: 'miami', name: 'Miami Open' }]));
    render(<MemoryRouter initialEntries={['/tennis/tournaments']}><Routes><Route path="/tennis/tournaments" element={<TennisTournamentsPage />} /></Routes></MemoryRouter>);
    const table = await screen.findByTestId('tennis-tournaments-table');
    expect(within(table).getAllByRole('link', { name: /Wimbledon|Miami Open/ }).map((a) => a.textContent)).toEqual(['Wimbledon', 'Miami Open']);
    fireEvent.change(screen.getByTestId('tennis-tournament-search'), { target: { value: 'united states' } });
    expect(within(table).queryByRole('link', { name: 'Wimbledon' })).toBeNull();
    fireEvent.change(screen.getByTestId('tennis-tournament-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('tennis-level-filter'), { target: { value: 'Grand Slam' } });
    expect(within(table).queryByRole('link', { name: 'Miami Open' })).toBeNull();
  });

  it('an edition page shows the paths and the draw; tapping a player highlights their route', async () => {
    mocked.loadTennisEdition.mockResolvedValue({ event: ev, edition: ed(2025, 1, 2), matches: edition, years: [2024, 2025] });
    render(<MemoryRouter initialEntries={['/tennis/tournaments/atp/wimbledon/2025']}><Routes><Route path="/tennis/tournaments/:tour/:slug/:year" element={<TennisEditionPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByTestId('tennis-edition-story')).toHaveTextContent('P1 beat P2 6-3 6-3 6-3 in the final. 8 matches, 1 won by the outsider.');
    const draw = screen.getByTestId('tennis-draw');
    const p4 = within(draw).getAllByRole('button', { name: /^P4/ });
    fireEvent.click(p4[0]);
    expect(within(draw).getAllByRole('button', { pressed: true }).length).toBe(2); // P4's QF win and SF loss
    expect(screen.getByRole('link', { name: '← 2024' })).toBeInTheDocument();
  });

  it('TV guide: under way and coming weeks with the UK channel', async () => {
    mocked.loadTennisGuide.mockResolvedValue({
      calendar: [{ event_id: 7, tour: 'WTA', slug: 'wuhan', name: 'Wuhan Open', city: 'Wuhan', country: 'CN', level: '1000', level_rank: 3, surface: 'Hard', usual_start: '2026-10-05', usual_end: '2026-10-11', last_year: 2025, last_winner: null, last_winner_slug: null, channel: 'Sky Sports', free_to_air: null }],
      recent: [],
      latestDate: '2026-10-04',
    });
    render(<MemoryRouter><TennisTvGuidePage today="2026-10-06" /></MemoryRouter>);
    // The shared TV guide layout (as Football and NFL): one row per tournament, "On now" while it's on.
    const link = await screen.findByRole('link', { name: 'Wuhan Open' });
    expect(link.getAttribute('href')).toBe('/tennis/tournaments/wta/wuhan');
    const row = link.closest('li')!;
    expect(row).toHaveTextContent('On now');
    expect(row).toHaveTextContent('Sky Sports');
    expect(screen.getByRole('group', { name: 'Quick filters' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/team/i)).toBeNull();
  });
});

describe('tennis phase 3 server renders', () => {
  it('tournaments, event, edition and TV guide pages render with their own heads', () => {
    const list = renderTennisTournamentsPage(api.buildTournaments('ATP', [ev], [ed(2025, 1, 2)]));
    expect(list.canonical).toMatch(/\/tennis\/tournaments$/);
    expect(list.html).toContain('Wimbledon');
    const e = renderTennisEventPage({ event: ev, summary: eventSummary([ed(2024, 1, 2), ed(2025, 1, 3)], edition) });
    expect(e.description).toBe('Wimbledon (London, United Kingdom): played 2 times from 2024 to 2025 in this data. Most titles: P1 (2).');
    const d = renderTennisEditionPage({ event: ev, edition: ed(2025, 1, 2), matches: edition, years: [2025] });
    expect(d.canonical).toMatch(/\/tennis\/tournaments\/atp\/wimbledon\/2025$/);
    expect(d.html).toContain('The draw from the quarter-finals');
    const g = renderTennisTvGuidePage({ calendar: [], recent: [], latestDate: null }, '2026-10-06');
    expect(g.description).toContain('0 tournaments this week');
  });
});
