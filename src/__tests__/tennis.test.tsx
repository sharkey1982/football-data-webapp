// Tennis section (phase 2): builders, pages and server renders.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/tennisApi';
import {
  groupByTournament,
  isUpset,
  odds,
  playerSummary,
  scoreLabel,
  seasonIndex,
  seasonSentence,
  seasonSummary,
  slamCounts,
  type TennisMatch,
  type TennisPlayer,
} from '../lib/tennisStats';
import TennisPlayersPage from '../pages/tennis/TennisPlayersPage';
import TennisPlayerPage from '../pages/tennis/TennisPlayerPage';
import TennisSeasonPage from '../pages/tennis/TennisSeasonPage';
import TennisResultsPage from '../pages/tennis/TennisResultsPage';
import StagePage from '../pages/StagePage';
import { THEMES, menuOrder } from '../lib/journey';
import { renderTennisPlayerPage, renderTennisResultsPage, renderTennisSeasonPage, renderTennisSeasonsPage } from '../entry-server';

vi.mock('../lib/tennisApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/tennisApi');
  return { ...actual, loadTennisPlayers: vi.fn(), loadTennisPlayer: vi.fn(), loadTennisSeason: vi.fn(), loadTennisResults: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

let n = 0;
const P = {
  sinner: { id: 1, name: 'Sinner J.', slug: 'sinner-j' },
  alcaraz: { id: 2, name: 'Alcaraz C.', slug: 'alcaraz-c' },
  zverev: { id: 3, name: 'Zverev A.', slug: 'zverev-a' },
  qualifier: { id: 4, name: 'Nobody X.', slug: 'nobody-x' },
};
type Who = (typeof P)[keyof typeof P];
function m(w: Who, l: Who, over: Partial<TennisMatch> = {}): TennisMatch {
  n++;
  return {
    source_key: `ATP|2026|${over.tournament ?? 'Open'}|${over.round ?? '1st Round'}|${w.name}|${l.name}|${n}`,
    tour: 'ATP',
    year: 2026,
    match_date: '2026-01-10',
    tournament: 'Open',
    tournament_slug: 'open',
    location: 'Town',
    surface_group: 'Hard',
    level: '250',
    level_rank: 6,
    round: '1st Round',
    round_order: 1,
    best_of: 3,
    winner: w.name,
    winner_slug: w.slug,
    winner_id: w.id,
    loser: l.name,
    loser_slug: l.slug,
    loser_id: l.id,
    w_rank: 1,
    l_rank: 2,
    w_games: [6, 6],
    l_games: [4, 4],
    result: 'Completed',
    played: true,
    avg_w: 1.5,
    avg_l: 2.6,
    b365_w: null,
    b365_l: null,
    ps_w: null,
    ps_l: null,
    ...over,
  };
}
const final = (w: Who, l: Who, over: Partial<TennisMatch> = {}) => m(w, l, { round: 'The Final', round_order: 7, ...over });

const season = [
  m(P.sinner, P.qualifier, { match_date: '2026-01-20', tournament: 'Australian Open', level: 'Grand Slam', level_rank: 1 }),
  m(P.sinner, P.zverev, { match_date: '2026-01-30', tournament: 'Australian Open', level: 'Grand Slam', level_rank: 1, round: 'Semifinals', round_order: 6 }),
  final(P.sinner, P.alcaraz, { match_date: '2026-02-01', tournament: 'Australian Open', level: 'Grand Slam', level_rank: 1 }),
  // walkover: neither extends nor breaks Sinner's run
  m(P.sinner, P.zverev, { match_date: '2026-03-01', tournament: 'Masters', level: '1000', level_rank: 3, result: 'Walkover', played: false, w_games: [], l_games: [] }),
  m(P.qualifier, P.sinner, { match_date: '2026-03-03', tournament: 'Masters', level: '1000', level_rank: 3, round: '2nd Round', round_order: 2, w_rank: 150, l_rank: 1, avg_w: 9.5, avg_l: 1.05 }),
  final(P.alcaraz, P.zverev, { match_date: '2026-04-10', tournament: 'Clay Open', surface_group: 'Clay' }),
  final(P.alcaraz, P.sinner, { match_date: '2026-05-10', tournament: 'Grass Open', surface_group: 'Grass', result: 'Walkover', played: false, w_games: [], l_games: [] }),
];

describe('tennis builders', () => {
  it('formats scores, walkovers and retirements', () => {
    expect(scoreLabel({ w_games: [6, 3, 7], l_games: [4, 6, 6], result: 'Completed' })).toBe('6-4 3-6 7-6');
    expect(scoreLabel({ w_games: [6, 2], l_games: [4, 0], result: 'Retired' })).toBe('6-4 2-0 ret.');
    expect(scoreLabel({ w_games: [], l_games: [], result: 'Walkover' })).toBe('Walkover');
  });

  it('reads odds from the average market, then Bet365, then Pinnacle; an upset is the outsider winning', () => {
    expect(odds({ avg_w: null, avg_l: null, b365_w: 3, b365_l: 1.3, ps_w: 3.2, ps_l: 1.35 })).toEqual({ w: 3, l: 1.3 });
    expect(isUpset({ avg_w: 3, avg_l: 1.4, b365_w: null, b365_l: null, ps_w: null, ps_l: null, played: true })).toBe(true);
    expect(isUpset({ avg_w: 3, avg_l: 1.4, b365_w: null, b365_l: null, ps_w: null, ps_l: null, played: false })).toBe(false);
  });

  it('player record counts played matches only; a final won by walkover is still a title', () => {
    const s = playerSummary({ player_id: P.alcaraz.id, name: P.alcaraz.name, tour: 'ATP' }, season.filter((x) => x.winner_id === 2 || x.loser_id === 2));
    expect([s.won, s.lost]).toEqual([1, 1]); // beat Zverev, lost the AO final; the walkover doesn't count
    expect(s.titles).toBe(2);
    expect(s.finals).toBe(3);
    expect(s.titleYears[0]).toEqual({ year: 2026, titles: ['Clay Open', 'Grass Open'], runnerUp: ['Australian Open'] });
    expect(s.bySurface.find((r) => r.key === 'Grass')).toMatchObject({ won: 0, lost: 0, titles: 1 });
  });

  it('best wins by odds and by ranking', () => {
    const s = playerSummary({ player_id: 4, name: 'Nobody X.', tour: 'ATP' }, season.filter((x) => x.winner_id === 4 || x.loser_id === 4));
    expect(s.bestWinsByOdds[0].odds).toBe(9.5);
    expect(s.bestWinsByRank[0].opponentRank).toBe(1);
    expect(s.bestRank).toEqual({ rank: 2, date: '2026-01-20' });
  });

  it('season: big finals, leaders, upsets and the longest run (walkovers ignored)', () => {
    const s = seasonSummary('ATP', 2026, season, '2026-10-04');
    expect(s.bigFinals.map((f) => f.tournament)).toEqual(['Australian Open']);
    expect(s.leaders[0]).toMatchObject({ name: 'Alcaraz C.', titles: 2, finals: 3 });
    expect(s.upsetsByOdds[0].match.winner).toBe('Nobody X.');
    expect(s.upsetsByRank[0].rankGap).toBe(149);
    expect(s.streaks[0]).toMatchObject({ name: 'Sinner J.', length: 3 });
    expect(s.complete).toBe(false);
    expect(seasonSentence(s)).toBe('The 2026 ATP season so far: 5 matches. Grand Slam champion: Sinner J.; most titles: Alcaraz C. (2).');
  });

  it('season index and Grand Slam counts come from finals', () => {
    const rows = seasonIndex(season.filter((x) => x.round === 'The Final'), '2026-10-04');
    expect(rows[0]).toMatchObject({ year: 2026, topName: 'Alcaraz C.', topTitles: 2, finals: 3, complete: false });
    expect(slamCounts(rows)).toEqual([{ name: 'Sinner J.', slug: 'sinner-j', n: 1 }]);
  });

  it('groups a day by tournament, biggest level first, latest round first', () => {
    const g = groupByTournament(season.slice(0, 5));
    expect(g.map((x) => x.tournament)).toEqual(['Australian Open', 'Masters']);
    expect(g[0].matches[0].round).toBe('The Final');
  });

  it('detail paths carry the tour; list paths take ?tour= for the WTA only', () => {
    expect(api.tennisPlayerPath('WTA', 'swiatek-i')).toBe('/tennis/players/wta/swiatek-i');
    expect(api.tennisSeasonPath('ATP', 2024)).toBe('/tennis/seasons/atp/2024');
    expect(api.tennisPlayersPath('ATP')).toBe('/tennis/players');
    expect(api.tennisResultsPath('WTA', '2026-09-27')).toBe('/tennis/results?tour=wta&date=2026-09-27');
    expect(api.tennisYears('WTA', 2009)).toEqual([2009, 2008, 2007]);
  });
});

const player = (over: Partial<TennisPlayer>): TennisPlayer => ({
  player_id: 1, tour: 'ATP', name: 'Sinner J.', slug: 'sinner-j', won: 300, lost: 80, titles: 25, finals: 33,
  first_year: 2019, last_year: 2026, last_match: '2026-09-29', recent_matches: 200, ...over,
});

describe('tennis pages', () => {
  it('Your Player: a sortable list with the ATP/WTA toggle and a search', async () => {
    mocked.loadTennisPlayers.mockResolvedValue({
      tour: 'ATP',
      // Default order: latest ranking (unranked last).
      players: [player({ latest_rank: 2 }), player({ player_id: 2, name: 'Alcaraz C.', slug: 'alcaraz-c', titles: 30, recent_matches: 210, latest_rank: 1 }), player({ player_id: 3, name: 'Old P.', slug: 'old-p', titles: 1, recent_matches: 0 })],
    });
    render(<MemoryRouter initialEntries={['/tennis/players']}><Routes><Route path="/tennis/players" element={<TennisPlayersPage />} /></Routes></MemoryRouter>);
    const table = await screen.findByTestId('tennis-players-table');
    const names = () => within(table).getAllByRole('link').map((a) => a.textContent);
    expect(names()).toEqual(['Alcaraz C.', 'Sinner J.', 'Old P.']);
    fireEvent.click(within(table).getByRole('button', { name: /Titles/ }));
    expect(names()[0]).toBe('Alcaraz C.');
    fireEvent.click(within(table).getByRole('button', { name: /Titles/ }));
    expect(names()[0]).toBe('Old P.');
    fireEvent.change(screen.getByTestId('tennis-player-search'), { target: { value: 'sin' } });
    expect(names()).toEqual(['Sinner J.']);
    expect(within(screen.getByTestId('tour-toggle')).getByRole('link', { name: 'WTA' }).getAttribute('href')).toBe('/tennis/players?tour=wta');
  });

  it('a player page shows the record, titles and links each season', async () => {
    const rows = season.filter((x) => x.winner_id === 2 || x.loser_id === 2);
    mocked.loadTennisPlayer.mockResolvedValue(api.buildTennisPlayer(player({ player_id: 2, name: 'Alcaraz C.', slug: 'alcaraz-c' }), rows));
    render(<MemoryRouter initialEntries={['/tennis/players/atp/alcaraz-c']}><Routes><Route path="/tennis/players/:tour/:slug" element={<TennisPlayerPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByTestId('tennis-player-story')).toHaveTextContent('Alcaraz C.: 1–1 in ATP tour-level matches in 2026, 2 titles.');
    expect(mocked.loadTennisPlayer).toHaveBeenCalledWith('ATP', 'alcaraz-c');
    expect(within(screen.getByTestId('tennis-player-titles')).getByRole('link', { name: '2026' }).getAttribute('href')).toBe('/tennis/seasons/atp/2026');
  });

  it('a season page tells the story and the WTA toggle keeps the year', async () => {
    mocked.loadTennisSeason.mockResolvedValue({ summary: seasonSummary('ATP', 2026, season, '2026-10-04'), years: [2026, 2025] });
    render(<MemoryRouter initialEntries={['/tennis/seasons/atp/2026']}><Routes><Route path="/tennis/seasons/:tour/:year" element={<TennisSeasonPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByTestId('tennis-season-story')).toHaveTextContent('Grand Slam champion: Sinner J.');
    expect(within(screen.getByTestId('tour-toggle')).getByRole('link', { name: 'WTA' }).getAttribute('href')).toBe('/tennis/seasons/wta/2026');
    expect(screen.getByRole('link', { name: '← 2025' })).toBeInTheDocument();
  });

  it('a season before the WTA started has no WTA link', async () => {
    mocked.loadTennisSeason.mockResolvedValue({ summary: { ...seasonSummary('ATP', 2026, season, '2026-10-04'), year: 2003 }, years: [2004, 2003] });
    render(<MemoryRouter initialEntries={['/tennis/seasons/atp/2003']}><Routes><Route path="/tennis/seasons/:tour/:year" element={<TennisSeasonPage />} /></Routes></MemoryRouter>);
    await screen.findByTestId('tennis-season-story');
    expect(within(screen.getByTestId('tour-toggle')).queryByRole('link', { name: 'WTA' })).toBeNull();
  });

  it('Results: the latest day by tournament, with rankings and upsets marked', async () => {
    mocked.loadTennisResults.mockResolvedValue({ tour: 'ATP', latestDate: '2026-03-03', from: '2026-02-01', to: '2026-03-31', matches: season.slice(2, 5) });
    render(<MemoryRouter initialEntries={['/tennis/results']}><Routes><Route path="/tennis/results" element={<TennisResultsPage />} /></Routes></MemoryRouter>);
    const day = await screen.findByTestId('tennis-results-day');
    expect(day).toHaveTextContent('Masters');
    expect(day).toHaveTextContent('Upset 9.50');
    expect(day).not.toHaveTextContent('Australian Open');
  });

  it('the tennis stage page and menu come from the journey config', () => {
    render(<MemoryRouter initialEntries={['/tennis/discover']}><Routes><Route path="/tennis/:stage" element={<StagePage themeKey="tennis" />} /></Routes></MemoryRouter>);
    for (const link of THEMES.tennis.stages[0].links) expect(screen.getByRole('link', { name: new RegExp(link.label) })).toBeInTheDocument();
    expect(menuOrder()).toEqual(expect.arrayContaining(['/tennis/results', '/tennis/players', '/tennis/seasons']));
  });
});

describe('tennis server renders', () => {
  it('render content and page-specific heads', async () => {
    const results = renderTennisResultsPage({ tour: 'ATP', latestDate: '2026-03-03', from: '2026-02-01', to: '2026-03-31', matches: season.slice(2, 5) });
    expect(results.html).toContain('Upset 9.50');
    expect(results.description).toBe('ATP results for 3 Mar 2026: 1 match at 1 tournament.');
    const s = renderTennisSeasonPage({ summary: seasonSummary('ATP', 2026, season, '2026-10-04'), years: [2026] });
    expect(s.canonical).toMatch(/\/tennis\/seasons\/atp\/2026$/);
    expect(s.html).toContain('Australian Open');
    const idx = renderTennisSeasonsPage({ tour: 'ATP', rows: seasonIndex(season.filter((x) => x.round === 'The Final'), '2026-10-04') });
    expect(idx.description).toContain('Most Grand Slam titles: Sinner J. (1)');
    const p = renderTennisPlayerPage(api.buildTennisPlayer(player({ player_id: 2, name: 'Alcaraz C.', slug: 'alcaraz-c' }), season));
    expect(p.canonical).toMatch(/\/tennis\/players\/atp\/alcaraz-c$/);
    await waitFor(() => expect(p.html).toContain('Alcaraz C.'));
  });
});
