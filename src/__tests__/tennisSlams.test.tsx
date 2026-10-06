// Grand Slams (6 Oct 2026): the page, its builders, and the "Grand Slams only"
// switch on Fixtures & Results, Tournaments and Your Player.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/tennisApi';
import { comingTournaments, slamLeaders, slamNow, slamsSentence, slamTable, withSlams, type CalendarRow, type TennisEdition } from '../lib/tennisEvents';
import type { TennisMatch } from '../lib/tennisStats';
import TennisSlamsPage from '../pages/tennis/TennisSlamsPage';
import TennisResultsPage from '../pages/tennis/TennisResultsPage';
import { renderTennisSlamsPage } from '../entry-server';

vi.mock('../lib/tennisApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/tennisApi');
  return { ...actual, loadTennisSlams: vi.fn(), loadTennisResults: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const SLUG: Record<string, string> = { 'Australian Open': 'australian-open', 'French Open': 'french-open', Wimbledon: 'wimbledon', 'US Open': 'us-open' };
const MONTH: Record<string, string> = { 'Australian Open': '01-12', 'French Open': '05-25', Wimbledon: '06-30', 'US Open': '08-25' };
let tid = 0;
function ed(name: string, year: number, winner: string | null, runner: string | null, over: Partial<TennisEdition> = {}): TennisEdition {
  const start = `${year}-${MONTH[name]}`;
  return {
    tournament_id: ++tid, year, event_id: 1, event_slug: SLUG[name], tour: 'ATP', name, city: 'X', start_date: start, end_date: start,
    level: 'Grand Slam', level_rank: 1, surface: 'Hard', matches: 127,
    winner, winner_slug: winner ? winner.toLowerCase() : null, runner_up: runner, runner_up_slug: runner ? runner.toLowerCase() : null, ...over,
  };
}
const editions = [
  ed('Australian Open', 2025, 'Sinner', 'Zverev'),
  ed('French Open', 2025, 'Alcaraz', 'Sinner'),
  ed('Wimbledon', 2025, 'Sinner', 'Alcaraz'),
  ed('US Open', 2025, 'Alcaraz', 'Sinner'),
  ed('Australian Open', 2026, 'Alcaraz', 'Djokovic'),
  ed('Wimbledon', 2020, null, null, { matches: 0 }),
  // Not a Slam: ignored.
  ed('Wimbledon', 2024, 'Nobody', 'Else', { level: '250', name: 'Halle' }),
];
const cal = (name: string, start: string, end: string, over: Partial<CalendarRow> = {}): CalendarRow => ({
  event_id: tid++, tour: 'ATP', slug: SLUG[name] ?? 'paris', name, city: 'X', country: null, level: 'Grand Slam', level_rank: 1, surface: 'Hard',
  usual_start: start, usual_end: end, last_year: 2026, last_winner: 'Alcaraz', last_winner_slug: 'alcaraz', channel: 'TNT Sports', free_to_air: null, ...over,
});
const calendar = [cal('Australian Open', '2027-01-17', '2027-01-31'), cal('French Open', '2027-05-23', '2027-06-06'), cal('Wimbledon', '2027-06-28', '2027-07-11', { channel: 'BBC' }), cal('Paris', '2026-10-26', '2026-11-01', { level: '1000', level_rank: 3 })];

describe('Grand Slam builders', () => {
  it('champions by year: one cell per Slam, newest year first, other levels ignored', () => {
    const t = slamTable(editions);
    expect(t.map((r) => r.year)).toEqual([2026, 2025, 2020]);
    expect(t[1].cells.Wimbledon?.winner).toBe('Sinner');
    expect(t[0].cells['US Open']).toBeNull();
    expect(t[2].cells.Wimbledon?.winner).toBeNull();
  });

  it('most titles, then finals, with the count at each Slam', () => {
    const l = slamLeaders(editions);
    expect(l.slice(0, 3).map((x) => [x.name, x.titles, x.finals])).toEqual([['Alcaraz', 3, 4], ['Sinner', 2, 4], ['Djokovic', 0, 1]]);
    expect(l[0].bySlam).toEqual({ 'Australian Open': 1, 'French Open': 1, Wimbledon: 0, 'US Open': 1 });
    expect(l.some((x) => x.name === 'Nobody')).toBe(false);
    expect(slamsSentence('ATP', slamTable(editions), l)).toBe('5 ATP Grand Slams since 2000 have had 2 different champions. Alcaraz has the most, 3.');
  });

  it('the Slam on now, or else the next one', () => {
    expect(slamNow(calendar, editions, 'ATP', '2026-10-06')).toMatchObject({ slam: 'Australian Open', state: 'next', start: '2027-01-17' });
    const live = [...editions, ed('French Open', 2026, null, null, { start_date: '2026-05-24', end_date: '2026-05-30' })];
    expect(slamNow(calendar, live, 'ATP', '2026-05-30')).toMatchObject({ slam: 'French Open', state: 'on', channel: 'TNT Sports' });
  });

  it('the coming tournaments, all or Slams only, and the ?slams=1 link helper', () => {
    expect(comingTournaments(calendar, 'ATP', '2026-10-01', false).map((c) => c.name)).toEqual(['Paris', 'Australian Open', 'French Open', 'Wimbledon']);
    expect(comingTournaments(calendar, 'ATP', '2026-10-01', true, 2).map((c) => c.name)).toEqual(['Australian Open', 'French Open']);
    expect(withSlams('/tennis/results', true)).toBe('/tennis/results?slams=1');
    expect(withSlams('/tennis/results?tour=wta', true)).toBe('/tennis/results?tour=wta&slams=1');
    expect(withSlams('/tennis/results', false)).toBe('/tennis/results');
  });
});

describe('Grand Slams page and filter', () => {
  it('shows the next Slam, champions by year linked to each draw, and most titles', async () => {
    mocked.loadTennisSlams.mockResolvedValue({ tour: 'ATP', editions, calendar });
    render(<MemoryRouter initialEntries={['/tennis/grand-slams']}><Routes><Route path="/tennis/grand-slams" element={<TennisSlamsPage today="2026-10-06" />} /></Routes></MemoryRouter>);
    expect(await screen.findByTestId('tennis-slam-now')).toHaveTextContent('Next: Australian Open');
    const years = screen.getByTestId('tennis-slams-years');
    expect(within(years).getAllByRole('link', { name: 'Sinner' }).map((a) => a.getAttribute('href'))).toContain('/tennis/tournaments/atp/wimbledon/2025');
    expect(screen.getByTestId('tennis-slams-leaders')).toHaveTextContent('Alcaraz');
    expect(screen.getByRole('link', { name: /French Open\s*Clay/ }).getAttribute('href')).toBe('/tennis/tournaments/atp/french-open');
  });

  it('renders on the server with a description from the data', () => {
    const page = renderTennisSlamsPage({ tour: 'ATP', editions, calendar }, '2026-10-06');
    expect(page.html).toContain('Champions by year');
    expect(page.description).toContain('Alcaraz has the most, 3');
    expect(page.canonical).toMatch(/\/tennis\/grand-slams$/);
  });

  it('Fixtures & Results: the coming tournaments, and Grand Slams only keeps Slam matches', async () => {
    const match = (tournament: string, level: TennisMatch['level'], date: string, k: string) =>
      ({ source_key: k, tour: 'ATP', year: 2026, match_date: date, tournament_id: 1, tournament, tournament_slug: 'x', location: 'X', surface_group: 'Hard', level, level_rank: level === 'Grand Slam' ? 1 : 6, round: 'The Final', round_order: 7, best_of: 3, winner: 'A', winner_slug: 'a', winner_id: 1, loser: 'B', loser_slug: 'b', loser_id: 2, w_rank: 1, l_rank: 2, w_games: [6, 6], l_games: [1, 1], result: 'Completed', played: true, avg_w: null, avg_l: null, b365_w: null, b365_l: null, ps_w: null, ps_l: null }) as TennisMatch;
    mocked.loadTennisResults.mockResolvedValue({
      tour: 'ATP', latestDate: '2026-09-28', from: '2026-08-01', to: '2026-09-30', calendar,
      matches: [match('US Open', 'Grand Slam', '2026-09-07', 's1'), match('Tokyo', '500', '2026-09-28', 't1')],
    });
    render(<MemoryRouter initialEntries={['/tennis/results']}><Routes><Route path="/tennis/results" element={<TennisResultsPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Fixtures & Results' })).toBeInTheDocument();
    expect(screen.getByTestId('tennis-results-coming')).toHaveTextContent('Paris');
    expect(screen.getByTestId('tennis-results-day')).toHaveTextContent('Tokyo');
    fireEvent.click(screen.getByTestId('tennis-slams-toggle'));
    expect(await screen.findByText('US Open')).toBeInTheDocument();
    expect(screen.getByTestId('tennis-results-day')).not.toHaveTextContent('Tokyo');
    expect(screen.getByTestId('tennis-results-coming')).not.toHaveTextContent('Paris');
    expect(screen.getByTestId('tennis-results-slam-links')).toHaveTextContent('AO 2026');
  });
});
