import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import GameweekBrowser from '../pages/GameweekBrowser';
import * as api from '../lib/api';
import * as broadcastsApi from '../lib/broadcastsApi';

vi.mock('../lib/api', async () => ({
  getLeagues: vi.fn(),
  getMatchweekHeadToHead: vi.fn().mockResolvedValue(new Map()),
  getFitRunRhos: vi.fn().mockResolvedValue(new Map()),
  getCountries: vi.fn(),
  getSeasons: vi.fn(),
  getTeams: vi.fn(),
  getTeamById: vi.fn(),
  getFixturesForSeason: vi.fn(),
  getMatchesForSeasonAsFixtures: vi.fn(),
  getFixturesForTeam: vi.fn(),
  getLastFixtureRefresh: vi.fn().mockResolvedValue(null),
  getRecentEplFixtureChanges: vi.fn().mockResolvedValue([]),
  getMatchesForTeamAsFixtures: vi.fn(),
}));
vi.mock('../lib/broadcastsApi', async () => {
  const actual = await vi.importActual<typeof broadcastsApi>('../lib/broadcastsApi');
  return { ...actual, getFixtureBroadcasts: vi.fn() };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedBroadcasts = vi.mocked(broadcastsApi);
const TODAY = new Date().toISOString().slice(0, 10);

const FIXTURES = [
  { fixture_id: 1, league_id: 1, season_id: 13, home_team_id: 1, away_team_id: 2, home_team_name: 'Arsenal', away_team_name: 'Chelsea', kickoff_date: TODAY, kickoff_time: '15:00', matchweek: 1, status: 'scheduled', predicted_home_goals: 1.8, predicted_away_goals: 1.2 },
  { fixture_id: 2, league_id: 1, season_id: 13, home_team_id: 3, away_team_id: 4, home_team_name: 'Liverpool', away_team_name: 'Everton', kickoff_date: TODAY, kickoff_time: '17:30', matchweek: 1, status: 'scheduled', predicted_home_goals: 2.1, predicted_away_goals: 0.8 },
  { fixture_id: 3, league_id: 1, season_id: 13, home_team_id: 5, away_team_id: 6, home_team_name: 'Fulham', away_team_name: 'Brentford', kickoff_date: TODAY, kickoff_time: '15:00', matchweek: 1, status: 'scheduled', predicted_home_goals: 1.1, predicted_away_goals: 1.1 },
];

const bet = (fixtureId: number, over: Record<string, unknown> = {}) => ({
  broadcastId: fixtureId, fixtureId, market: 'GB', status: 'confirmed_broadcast', broadcaster: 'Sky Sports',
  channel: 'Sky Sports Main Event', streamingService: 'Sky Go', isFreeToAir: false, isSubscription: true, isPpv: false,
  watchUrl: null, source: 'test', sourceUrl: null, verifiedAt: TODAY, ...over,
});

const setup = () => {
  // vi.resetAllMocks() below also clears the .mockResolvedValue defaults
  // set inline in the vi.mock('../lib/api', ...) factory, so those need
  // restating here too -- otherwise components that call them (e.g.
  // FixtureChangeBanner) see undefined instead of a promise.
  mockedApi.getMatchweekHeadToHead.mockResolvedValue(new Map());
  mockedApi.getFitRunRhos.mockResolvedValue(new Map());
  mockedApi.getLastFixtureRefresh.mockResolvedValue(null);
  mockedApi.getRecentEplFixtureChanges.mockResolvedValue([]);
  mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League', tier: null, country_id: 1, competition_type: 'league', scope: 'domestic' }]);
  mockedApi.getCountries.mockResolvedValue([{ country_id: 1, name: 'England', code: 'EN' }]);
  mockedApi.getSeasons.mockResolvedValue([{ season_id: 13, label: '2627', start_year: 2026, end_year: 2027 }]);
  mockedApi.getFixturesForSeason.mockResolvedValue(FIXTURES);
};

beforeEach(() => {
  vi.resetAllMocks();
  setup();
});

const renderProjections = () =>
  render(
    <MemoryRouter initialEntries={['/?league=1&season=13']}>
      <GameweekBrowser variant="projections" />
    </MemoryRouter>
  );

describe('GameweekBrowser UK broadcast integration', () => {
  it('badges Arsenal (Sky, subscription) and Liverpool (ITV, free-to-air); Fulham with no row is unbadged, not guessed at', async () => {
    mockedBroadcasts.getFixtureBroadcasts.mockResolvedValue(
      new Map([
        [1, [bet(1)]],
        [2, [bet(2, { broadcaster: 'ITV1', channel: null, streamingService: 'ITVX', isFreeToAir: true, isSubscription: false })]],
      ])
    );
    renderProjections();
    await screen.findByText('Arsenal');
    await waitFor(() => expect(screen.getByText('Sky Sports')).toBeInTheDocument());
    expect(screen.getByText('ITV1')).toBeInTheDocument();
    expect(screen.getByTitle(/ITV1.*free-to-air/)).toBeInTheDocument();
    // Fulham (fixture 3) got no broadcast row at all -- "not yet determined"
    // renders as nothing, not a placeholder that could be misread as a fact.
    expect(screen.queryByText('Not on TV')).not.toBeInTheDocument();
  });

  it('shows "Not on TV" only for a fixture explicitly confirmed not televised', async () => {
    mockedBroadcasts.getFixtureBroadcasts.mockResolvedValue(
      new Map([[3, [{ ...bet(3), status: 'confirmed_not_televised', broadcaster: null, channel: null, streamingService: null, isSubscription: false }]]])
    );
    renderProjections();
    await screen.findByText('Fulham');
    await waitFor(() => expect(screen.getByText('Not on TV')).toBeInTheDocument());
    // Arsenal and Liverpool have no row -- still unbadged, not "Not on TV".
    expect(screen.getAllByText('Not on TV')).toHaveLength(1);
  });

  it('the On TV / Free-to-air filter narrows the list without changing the group header count', async () => {
    const user = userEvent.setup();
    mockedBroadcasts.getFixtureBroadcasts.mockResolvedValue(
      new Map([
        [1, [bet(1)]], // Sky, subscription
        [2, [bet(2, { broadcaster: 'ITV1', channel: null, streamingService: 'ITVX', isFreeToAir: true, isSubscription: false })]], // free
        // Fulham (3): no row -- "unknown", excluded from both On TV and Free-to-air
      ])
    );
    renderProjections();
    await screen.findByText('Arsenal');
    expect(screen.getByText('3 fixtures')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'On TV' }));
    await waitFor(() => expect(screen.queryByText('Fulham')).not.toBeInTheDocument());
    expect(screen.getByText('Arsenal')).toBeInTheDocument();
    expect(screen.getByText('Liverpool')).toBeInTheDocument();
    // Header count is unaffected by the row-level filter -- it still counts
    // every fixture in the matchweek, not just the ones currently shown.
    expect(screen.getByText('3 fixtures')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Free-to-air' }));
    await waitFor(() => expect(screen.queryByText('Arsenal')).not.toBeInTheDocument());
    expect(screen.getByText('Liverpool')).toBeInTheDocument();
  });

  it('the filter and badges are archive-view only -- no filter control, and no fetch, outside projections', async () => {
    render(
      <MemoryRouter initialEntries={['/?league=1&season=13']}>
        <GameweekBrowser variant="archive" />
      </MemoryRouter>
    );
    await screen.findByText('Arsenal');
    expect(screen.queryByRole('group', { name: 'Filter by UK broadcast' })).not.toBeInTheDocument();
    expect(mockedBroadcasts.getFixtureBroadcasts).not.toHaveBeenCalled();
  });
});
