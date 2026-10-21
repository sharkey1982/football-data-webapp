import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FootballHub from '../pages/FootballHub';
import * as landingApi from '../lib/landingApi';
import * as hubApi from '../lib/hubApi';
import * as matchesApi from '../lib/matchesApi';
import * as currentSeason from '../lib/currentSeason';

vi.mock('../lib/landingApi', async () => {
  const actual = await vi.importActual<typeof landingApi>('../lib/landingApi');
  return { ...actual, getFootballTrivia: vi.fn() };
});
vi.mock('../lib/hubApi', async () => {
  const actual = await vi.importActual<typeof hubApi>('../lib/hubApi');
  return { ...actual, getNextRound: vi.fn(), getTvNextDay: vi.fn() };
});
vi.mock('../lib/matchesApi', async () => {
  const actual = await vi.importActual<typeof matchesApi>('../lib/matchesApi');
  return { ...actual, getLeagueTable: vi.fn() };
});
vi.mock('../lib/currentSeason', async () => {
  const actual = await vi.importActual<typeof currentSeason>('../lib/currentSeason');
  return { ...actual, getCurrentSeasonId: vi.fn() };
});
vi.mock('../lib/teamSlugs', () => ({ useTeamSlugs: () => new Map([[1, 'arsenal'], [2, 'everton']]) }));

const m = (mod: unknown) => mod as Record<string, ReturnType<typeof vi.fn>>;

describe('Club home page', () => {
  beforeEach(() => {
    m(landingApi).getFootballTrivia.mockResolvedValue([]);
    m(currentSeason).getCurrentSeasonId.mockResolvedValue(13);
    m(hubApi).getNextRound.mockResolvedValue({
      matchweek: 8,
      fixtures: [{
        fixture_id: 10, slug: 'arsenal-v-everton-2026-10-24', league_id: 1, season_id: 13, home_team_id: 1, away_team_id: 2,
        home_team_name: 'Arsenal', away_team_name: 'Everton', kickoff_date: '2026-10-24', kickoff_time: '15:00:00', matchweek: 8,
        status: 'scheduled', predicted_home_goals: 1.51, predicted_away_goals: 0.54,
      }],
    });
    m(hubApi).getTvNextDay.mockResolvedValue({ date: '2026-10-21', items: [] });
    m(matchesApi).getLeagueTable.mockResolvedValue([
      { team_id: 1, team_name: 'Arsenal', played: 7, won: 6, drawn: 0, lost: 1, goalsFor: 11, goalsAgainst: 5, goalDifference: 6, pointsBeforeAdjustment: 18, pointsAdjustment: 0, points: 18, deductions: [] },
    ]);
  });

  it('opens on the coming round: expected goals, the favoured side, and links to each team and the match', async () => {
    render(<MemoryRouter><FootballHub /></MemoryRouter>);
    const round = await screen.findByTestId('hub-round');
    expect(await within(round).findByText(/Matchweek 8/)).toBeInTheDocument();
    expect(await within(round).findByText('1.5–0.5')).toBeInTheDocument();
    const arsenal = within(round).getByRole('link', { name: 'Arsenal' });
    expect(arsenal).toHaveAttribute('href', '/football/teams/arsenal');
    expect(arsenal.closest('span')).toHaveClass('font-semibold');
    expect(within(round).getByRole('link', { name: 'Preview' })).toHaveAttribute('href', '/football/matches/arsenal-v-everton-2026-10-24');
  });

  it('shows the top of the table with team links', async () => {
    render(<MemoryRouter><FootballHub /></MemoryRouter>);
    const table = await screen.findByTestId('hub-table');
    expect(await within(table).findByRole('link', { name: 'Arsenal' })).toHaveAttribute('href', '/football/teams/arsenal');
  });

  it('lists every club page in groups, with no Discover / Predict doors', async () => {
    render(<MemoryRouter><FootballHub /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'All club pages' })).toBeInTheDocument();
    for (const g of ['This week', 'Teams & tables', 'History', 'Insights & model']) expect(screen.getByRole('heading', { level: 3, name: g })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'League Table' })).toHaveAttribute('href', '/table');
    expect(screen.queryByRole('link', { name: /^Discover/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Beat the Shark/ })).toBeInTheDocument();
  });
});
