import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import FplHub from '../pages/FplHub';
import * as landingApi from '../lib/landingApi';
import * as hubApi from '../lib/hubApi';
import * as priceRiskApi from '../lib/priceRiskApi';
import * as injuryApi from '../lib/injuryApi';
import * as reportApi from '../lib/fplGameweekReport';
import * as stateApi from '../lib/fplGameweekState';

vi.mock('../lib/landingApi', async () => ({ ...(await vi.importActual<typeof landingApi>('../lib/landingApi')), getFplTrivia: vi.fn() }));
vi.mock('../lib/hubApi', async () => ({ ...(await vi.importActual<typeof hubApi>('../lib/hubApi')), getNextDeadline: vi.fn(), getTopProjected: vi.fn() }));
vi.mock('../lib/priceRiskApi', async () => ({ ...(await vi.importActual<typeof priceRiskApi>('../lib/priceRiskApi')), getPriceChangeRisk: vi.fn() }));
vi.mock('../lib/injuryApi', async () => ({ ...(await vi.importActual<typeof injuryApi>('../lib/injuryApi')), getInjuryReport: vi.fn() }));
vi.mock('../lib/fplGameweekReport', async () => ({ ...(await vi.importActual<typeof reportApi>('../lib/fplGameweekReport')), loadReportList: vi.fn() }));
vi.mock('../lib/fplGameweekState', async () => ({ ...(await vi.importActual<typeof stateApi>('../lib/fplGameweekState')), getOpenGameweek: vi.fn() }));

const m = (mod: unknown) => mod as Record<string, ReturnType<typeof vi.fn>>;

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

describe('FPL home page', () => {
  beforeEach(() => {
    m(landingApi).getFplTrivia.mockResolvedValue([]);
    m(hubApi).getNextDeadline.mockResolvedValue({ gw: 8, deadline: '2026-10-23T17:30:00Z' });
    m(hubApi).getTopProjected.mockResolvedValue({
      gw: 8,
      picks: [
        { fplPlayerId: 1, name: 'Haaland', slug: 'erling-haaland', team: 'Manchester City', teamId: 9, price: 14.5, points: 7.49, games: 1, status: 'a', chance: null },
        { fplPlayerId: 12, name: 'Saka', slug: 'bukayo-saka', team: 'Arsenal', teamId: 1, price: 9.6, points: 6.82, games: 1, status: 'd', chance: 50 },
      ],
    });
    m(priceRiskApi).getPriceChangeRisk.mockResolvedValue([
      { fpl_player_id: 2, web_name: 'Saka', slug: 'bukayo-saka', team_name: 'Arsenal', position_label: 'MID', price: 10, ownership: 40, transfers_in: 0, transfers_out: 0, net_transfers: 120000, pressure: 0.9, direction: 'rise' },
    ]);
    m(injuryApi).getInjuryReport.mockResolvedValue([
      { fpl_player_id: 3, web_name: 'Palmer', slug: 'cole-palmer', team_id: 4, team_name: 'Chelsea', position_label: 'MID', price: 10.5, ownership: 30, total_points: 40, status: 'd', chance_next_round: 75, news: '', return_date: null, fixtures_missed: null, next_fixture_date: null },
    ]);
    m(reportApi).loadReportList.mockResolvedValue([]);
    m(stateApi).getOpenGameweek.mockResolvedValue({
      state: { openGw: 7, nextGw: 8, showToggle: false, gamesRemaining: 0, defaultView: 'next' },
      games: [], topScorers: [], mostCaptained: null, mostSelected: null,
    });
  });

  it('opens on the gameweek and its deadline in UK time', async () => {
    render(<MemoryRouter><FplHub /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Gameweek 8' })).toBeInTheDocument();
    expect(screen.getByText(/Friday 23 October, 18:30/)).toBeInTheDocument();
  });

  it('links every player it names: projections, price pressure, injuries', async () => {
    render(<MemoryRouter><FplHub /></MemoryRouter>);
    expect(await within(await screen.findByTestId('hub-projected')).findByRole('link', { name: 'Haaland' })).toHaveAttribute('href', '/fpl/players/erling-haaland');
    expect(await within(screen.getByTestId('hub-prices')).findByRole('link', { name: 'Saka' })).toHaveAttribute('href', '/fpl/players/bukayo-saka');
    expect(await within(screen.getByTestId('hub-injuries')).findByRole('link', { name: 'Palmer' })).toHaveAttribute('href', '/fpl/players/cole-palmer');
    expect(screen.getByText(/Doubtful · 75%/)).toBeInTheDocument();
  });

  it('shows FPL\u2019s availability flag beside a flagged pick', async () => {
    render(<MemoryRouter><FplHub /></MemoryRouter>);
    const card = await screen.findByTestId('hub-projected');
    expect(await within(card).findByText('Doubtful 50%')).toBeInTheDocument();
  });

  it('sends an FPL ID to Rate My Team', async () => {
    render(
      <MemoryRouter initialEntries={['/fpl/start']}>
        <Routes>
          <Route path="/fpl/start" element={<FplHub />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/your FPL ID/), { target: { value: '1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rate it' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/fpl/rate-my-team?id=1234567');
  });

  it('lists every FPL page in groups', () => {
    render(<MemoryRouter><FplHub /></MemoryRouter>);
    for (const g of ['This week', 'Players', 'Plan my team', 'History', 'Insights & model']) expect(screen.getByRole('heading', { level: 3, name: g })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'All FPL pages' })).getByRole('link', { name: 'Price Changes' })).toHaveAttribute('href', '/fpl/price-risk');
  });

  it('shows the most useful tools, FPL first, and leaves the next gameweek alone outside a live one', async () => {
    render(<MemoryRouter><FplHub /></MemoryRouter>);
    const row = screen.getByTestId('popular-tools');
    const links = within(row).getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/fpl/rate-my-team');
    expect(within(row).getByRole('link', { name: /League Table/ })).toHaveAttribute('href', '/table');
    expect(await screen.findByRole('heading', { name: 'Gameweek 8' })).toBeInTheDocument();
    expect(screen.queryByTestId('hub-gw-toggle')).not.toBeInTheDocument();
  });
});

describe('FPL home page mid-gameweek', () => {
  const openData = (remaining: number) => ({
    state: { openGw: 8, nextGw: 9, showToggle: true, gamesRemaining: remaining, defaultView: remaining > 0 ? 'open' : 'next' },
    games: [
      { id: 71, kickoff: '2026-10-24T14:00:00Z', home: 'ARS', away: 'CRY', homeScore: 2, awayScore: 0, minutes: 90, state: 'done' },
      ...(remaining > 0 ? [{ id: 75, kickoff: '2026-10-25T14:00:00Z', home: 'EVE', away: 'TOT', homeScore: null, awayScore: null, minutes: 0, state: 'not_started' }] : []),
    ],
    topScorers: [{ fplPlayerId: 4, name: 'Gabriel', slug: 'gabriel', team: 'ARS', points: 15, minutes: 90, ownership: 30 }],
    mostCaptained: { fplPlayerId: 411, name: 'Haaland', slug: 'erling-haaland', team: 'MCI', points: 2, minutes: 90, ownership: 60 },
    mostSelected: null,
  });

  beforeEach(() => {
    m(landingApi).getFplTrivia.mockResolvedValue([]);
    m(hubApi).getNextDeadline.mockResolvedValue({ gw: 9, deadline: '2026-10-31T11:00:00Z' });
    m(hubApi).getTopProjected.mockResolvedValue({ gw: 9, picks: [] });
    m(priceRiskApi).getPriceChangeRisk.mockResolvedValue([]);
    m(injuryApi).getInjuryReport.mockResolvedValue([]);
    m(reportApi).loadReportList.mockResolvedValue([]);
  });

  it('opens on the gameweek in progress with its scores, and toggles to the next deadline', async () => {
    m(stateApi).getOpenGameweek.mockResolvedValue(openData(1));
    render(<MemoryRouter><FplHub /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Gameweek 8' })).toBeInTheDocument();
    const scores = screen.getByTestId('hub-gw-scores');
    expect(within(scores).getByText('2–0')).toBeInTheDocument();
    expect(within(scores).getByText('Still to play')).toBeInTheDocument();
    expect(within(screen.getByTestId('hub-gw-top')).getByRole('link', { name: 'Haaland' })).toHaveAttribute('href', '/fpl/players/erling-haaland');
    expect(screen.getByRole('button', { name: 'GW8 (in progress)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'GW9 (next deadline)' }));
    expect(await screen.findByRole('heading', { name: 'Gameweek 9' })).toBeInTheDocument();
    expect(screen.getByTestId('hub-projected')).toBeInTheDocument();
  });

  it('opens on the next gameweek once the last game has finished, keeping the toggle', async () => {
    m(stateApi).getOpenGameweek.mockResolvedValue(openData(0));
    render(<MemoryRouter><FplHub /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'GW9 (next deadline)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Gameweek 9' })).toBeInTheDocument();
  });

  it('links the reflection when it is published', async () => {
    m(stateApi).getOpenGameweek.mockResolvedValue(openData(0));
    m(reportApi).loadReportList.mockResolvedValue([{ fpl_event_id: 8, kind: 'reflection', season_label: '2026-27', title: 'GW8 reflection' }]);
    render(<MemoryRouter><FplHub /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'GW8 (in progress)' }));
    expect(await screen.findByRole('link', { name: 'Read the Gameweek 8 reflection' })).toHaveAttribute('href', '/fpl/gameweek/2026-27/8/reflection');
  });
});

describe('nextRound', () => {
  const f = (id: number, mw: number, date: string, played = false) => ({
    fixture_id: id, slug: null, league_id: 1, season_id: 13, home_team_id: id, away_team_id: id + 100, home_team_name: `H${id}`, away_team_name: `A${id}`,
    kickoff_date: date, kickoff_time: null, matchweek: mw, status: played ? 'played' : 'scheduled', full_time_home_goals: played ? 1 : null,
  });
  it('takes the first matchweek with a game to play, without its played games', async () => {
    const { nextRound } = await vi.importActual<typeof hubApi>('../lib/hubApi');
    const r = nextRound([f(1, 7, '2026-10-18', true), f(2, 8, '2026-10-24'), f(3, 8, '2026-10-23'), f(4, 9, '2026-10-31')] as never, '2026-10-21');
    expect(r.matchweek).toBe(8);
    expect(r.fixtures.map((x) => x.fixture_id)).toEqual([3, 2]);
  });
});
