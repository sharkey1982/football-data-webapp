import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import TeamExplorer from '../pages/TeamExplorer';
import * as api from '../lib/api';
import type { MatchWithNames } from '../lib/api';

// buildMatchTrend itself is left real (via ...actual) rather than mocked --
// it's a pure function, and testing through it end-to-end is what actually
// validates the wiring (team_id + slice size reaching the charts correctly),
// not just that some mock was called.
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    getLeagues: vi.fn(),
    getTeams: vi.fn(),
    getTeamBySlug: vi.fn(),
    getMatchesForTeam: vi.fn(),
    getMostRecentFixtureSeason: vi.fn(),
    getTeamsInLeagueFixtures: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function match(overrides: Partial<MatchWithNames>): MatchWithNames {
  return {
    match_date: '2026-08-01',
    home_team_id: 1,
    away_team_id: 2,
    home_team_name: 'Arsenal',
    away_team_name: 'Chelsea',
    full_time_home_goals: 2,
    full_time_away_goals: 1,
    full_time_result: 'H',
    ...overrides,
  } as MatchWithNames;
}

describe('TeamExplorer page', () => {
  it('wires the previously-unused GoalTrendChart and FormSequenceChart to the team\u2019s recent matches once a team is selected, capped at 15', async () => {
    mockedApi.getLeagues.mockResolvedValue([]);
    mockedApi.getTeams.mockResolvedValue([{ team_id: 1, canonical_name: 'Arsenal' }]);
    const matches: MatchWithNames[] = Array.from({ length: 20 }, (_, i) =>
      match({
        match_date: `2026-0${(i % 9) + 1}-01`,
        home_team_id: 1,
        away_team_id: 2,
        full_time_home_goals: 2,
        full_time_away_goals: 1,
        full_time_result: 'H',
      })
    );
    mockedApi.getMatchesForTeam.mockResolvedValue(matches);

    render(
      <MemoryRouter>
        <TeamExplorer />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Arsenal')).toBeInTheDocument());
    await user.click(screen.getByText('Arsenal'));

    await waitFor(() => expect(screen.getByText(/Recent form/)).toBeInTheDocument());
    expect(screen.getByText('Recent form \u2014 last 15')).toBeInTheDocument();
    const chartSection = screen.getByText('Recent form \u2014 last 15').closest('div')!;

    // Legend text from both chart components confirms they actually
    // rendered (not just the section wrapper) -- ResponsiveContainer's
    // own SVG content doesn't reliably render in jsdom, but this plain-JSX
    // legend does, and is a real signal each component mounted. Scoped to
    // the chart section specifically, since "Goals for"/"Goals against"
    // also appear as labels in TeamStatsPanel's own stats table above.
    expect(within(chartSection).getByText('Goals for')).toBeInTheDocument();
    expect(within(chartSection).getByText('Goals against')).toBeInTheDocument();
    expect(within(chartSection).getByText('Win')).toBeInTheDocument();
    expect(within(chartSection).getByText('Draw')).toBeInTheDocument();
    expect(within(chartSection).getByText('Loss')).toBeInTheDocument();
  });

  it('shows no chart section when a selected team has no match history', async () => {
    mockedApi.getLeagues.mockResolvedValue([]);
    mockedApi.getTeams.mockResolvedValue([{ team_id: 1, canonical_name: 'Newco FC' }]);
    mockedApi.getMatchesForTeam.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <TeamExplorer />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Newco FC')).toBeInTheDocument());
    await user.click(screen.getByText('Newco FC'));

    await waitFor(() => expect(mockedApi.getMatchesForTeam).toHaveBeenCalled());
    expect(screen.queryByText(/Recent form/)).not.toBeInTheDocument();
  });

  it('resolves /football/teams/:slug on load and auto-selects that team -- the canonical, bookmarkable entry point', async () => {
    mockedApi.getLeagues.mockResolvedValue([]);
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.getTeamBySlug.mockResolvedValue({ team_id: 42, canonical_name: 'Brentford', slug: 'brentford' });
    mockedApi.getMatchesForTeam.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/football/teams/brentford']}>
        <Routes>
          <Route path="/football/teams/:slug" element={<TeamExplorer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(mockedApi.getTeamBySlug).toHaveBeenCalledWith('brentford'));
    await waitFor(() => expect(mockedApi.getMatchesForTeam).toHaveBeenCalledWith(42, 60));
    expect(screen.getByRole('heading', { name: 'Brentford' })).toBeInTheDocument();
  });

  it('shows an error, not a crash, when the slug in the URL doesn\u2019t match any team', async () => {
    mockedApi.getLeagues.mockResolvedValue([]);
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.getTeamBySlug.mockResolvedValue(null);

    render(
      <MemoryRouter initialEntries={['/football/teams/not-a-real-team']}>
        <Routes>
          <Route path="/football/teams/:slug" element={<TeamExplorer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/No team found for "not-a-real-team"/)).toBeInTheDocument());
  });

  it('updates the URL to the selected team\u2019s canonical slug when picked from the browse list', async () => {
    mockedApi.getLeagues.mockResolvedValue([]);
    mockedApi.getTeams.mockResolvedValue([{ team_id: 7, canonical_name: 'Fulham', slug: 'fulham' }]);
    mockedApi.getMatchesForTeam.mockResolvedValue([]);

    function LocationDisplay() {
      const location = useLocation();
      return <div data-testid="current-path">{location.pathname}</div>;
    }

    render(
      <MemoryRouter initialEntries={['/teams']}>
        <LocationDisplay />
        <Routes>
          <Route path="/teams" element={<TeamExplorer />} />
          <Route path="/football/teams/:slug" element={<TeamExplorer />} />
        </Routes>
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Fulham')).toBeInTheDocument());
    await user.click(screen.getByText('Fulham'));

    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/football/teams/fulham'));
  });
});
