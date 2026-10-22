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

vi.mock('../lib/landingApi', async () => ({ ...(await vi.importActual<typeof landingApi>('../lib/landingApi')), getFplTrivia: vi.fn() }));
vi.mock('../lib/hubApi', async () => ({ ...(await vi.importActual<typeof hubApi>('../lib/hubApi')), getNextDeadline: vi.fn(), getTopProjected: vi.fn() }));
vi.mock('../lib/priceRiskApi', async () => ({ ...(await vi.importActual<typeof priceRiskApi>('../lib/priceRiskApi')), getPriceChangeRisk: vi.fn() }));
vi.mock('../lib/injuryApi', async () => ({ ...(await vi.importActual<typeof injuryApi>('../lib/injuryApi')), getInjuryReport: vi.fn() }));
vi.mock('../lib/fplGameweekReport', async () => ({ ...(await vi.importActual<typeof reportApi>('../lib/fplGameweekReport')), loadReportList: vi.fn() }));

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
    expect(screen.getByRole('link', { name: 'Price Changes' })).toHaveAttribute('href', '/fpl/price-risk');
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
