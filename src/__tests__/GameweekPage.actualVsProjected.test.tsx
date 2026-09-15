import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GameweekPage from '../pages/fpl/GameweekPage';
import * as fplSeasonApi from '../lib/fplSeasonApi';

vi.mock('../lib/fplSeasonApi', async () => {
  const actual = await vi.importActual<typeof fplSeasonApi>('../lib/fplSeasonApi');
  return {
    ...actual,
    getSeasonSummary: vi.fn(),
    getGameweekFixtures: vi.fn(),
    getGameweekPlayerProjections: vi.fn(),
    getSeasonActualVsProjected: vi.fn(),
  };
});

const mocked = fplSeasonApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderPage(matchweek = '5') {
  return render(
    <MemoryRouter initialEntries={[`/fpl/gameweek/${matchweek}`]}>
      <Routes>
        <Route path="/fpl/gameweek/:matchweek" element={<GameweekPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const summary = [{ matchweek: 5, first_kickoff: '2026-09-20', last_kickoff: '2026-09-21', fixture_count: 10, played_count: 0 }];
const fixtures = [
  {
    fixture_id: 41,
    matchweek: 5,
    kickoff_date: '2026-09-20',
    kickoff_time: '15:00:00',
    status: 'scheduled' as const,
    home_team_id: 1,
    home_team: 'Arsenal',
    away_team_id: 2,
    away_team: 'Chelsea',
    predicted_home_goals: 1.5,
    predicted_away_goals: 1.1,
    has_projection: true,
  },
];

describe('GameweekPage -- season actual vs projected', () => {
  it('explains honestly when no player has any projected total, rather than showing a silently empty column', async () => {
    mocked.getSeasonSummary.mockResolvedValue(summary);
    mocked.getGameweekFixtures.mockResolvedValue(fixtures);
    mocked.getSeasonActualVsProjected.mockResolvedValue([
      { fpl_player_id: 1, web_name: 'Haaland', games_played: 4, actual_total_points: 33, actual_ppg: 8.25, projected_total_points: null, projected_ppg: null },
      { fpl_player_id: 2, web_name: 'Raya', games_played: 4, actual_total_points: 29, actual_ppg: 7.25, projected_total_points: null, projected_ppg: null },
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Load season totals')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Load season totals'));

    await waitFor(() => expect(screen.getByText('Haaland')).toBeInTheDocument());
    expect(screen.getByText(/doesn.t yet have/)).toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument(); // actual total still shown
  });

  it('does not show the caveat once at least one player has a real projected total', async () => {
    mocked.getSeasonSummary.mockResolvedValue(summary);
    mocked.getGameweekFixtures.mockResolvedValue(fixtures);
    mocked.getSeasonActualVsProjected.mockResolvedValue([
      { fpl_player_id: 1, web_name: 'Haaland', games_played: 4, actual_total_points: 33, actual_ppg: 8.25, projected_total_points: 28, projected_ppg: 7 },
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Load season totals')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Load season totals'));

    await waitFor(() => expect(screen.getByText('Haaland')).toBeInTheDocument());
    expect(screen.queryByText(/doesn.t yet have/)).not.toBeInTheDocument();
  });
});
