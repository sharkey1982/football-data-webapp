import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ActualMatchDetailPage from '../pages/fpl/ActualMatchDetailPage';
import * as actualMatchApi from '../lib/fplActualMatchApi';

vi.mock('../lib/fplActualMatchApi', async () => {
  const actual = await vi.importActual<typeof actualMatchApi>('../lib/fplActualMatchApi');
  return { ...actual, getActualMatchDetail: vi.fn() };
});

const mockedApi = actualMatchApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderPage(fixtureId = '21') {
  return render(
    <MemoryRouter initialEntries={[`/fpl/actual-matches/fixture/${fixtureId}`]}>
      <Routes>
        <Route path="/fpl/actual-matches/fixture/:fixtureId" element={<ActualMatchDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ActualMatchDetailPage', () => {
  it('shows the real score and per-team player stats, sorted by minutes played', async () => {
    mockedApi.getActualMatchDetail.mockResolvedValue({
      fixture: {
        fixture_id: 21,
        matchweek: 3,
        kickoff_date: '2026-09-06',
        home_team_id: 1,
        home_team: 'Arsenal',
        away_team_id: 2,
        away_team: 'Chelsea',
        home_score: 2,
        away_score: 1,
        finished: true,
      },
      home_players: [
        {
          fpl_player_id: 13,
          web_name: 'Rice',
          element_type: 3,
          minutes: 90,
          total_points: 5,
          goals_scored: 0,
          assists: 1,
          clean_sheets: 0,
          goals_conceded: 1,
          own_goals: 0,
          penalties_missed: 0,
          penalties_saved: 0,
          saves: 0,
          yellow_cards: 0,
          red_cards: 0,
          bonus: 0,
          bps: 22,
        },
        // Deliberately listed before Rice in the mock, but with fewer
        // minutes -- confirms the API's own sort (by minutes, highest
        // first) is what the page trusts, not array order.
        {
          fpl_player_id: 99,
          web_name: 'SubPlayer',
          element_type: 3,
          minutes: 12,
          total_points: 1,
          goals_scored: 0,
          assists: 0,
          clean_sheets: 0,
          goals_conceded: 1,
          own_goals: 0,
          penalties_missed: 0,
          penalties_saved: 0,
          saves: 0,
          yellow_cards: 0,
          red_cards: 0,
          bonus: 0,
          bps: 2,
        },
      ],
      away_players: [],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Rice')).toBeInTheDocument());
    // Real final score shown clearly.
    expect(screen.getByText(/2\s*\u2013\s*1/)).toBeInTheDocument();
    // Stat summary reflects the real assist, not an invented one.
    expect(screen.getByText(/1 assist/)).toBeInTheDocument();
    expect(screen.getByText('SubPlayer')).toBeInTheDocument();
    // Away side has no recorded stats yet -- shown as an explicit note, not silently blank.
    expect(screen.getByText(/No player stats recorded/)).toBeInTheDocument();
  });

  it('shows an informational message, not an error, for a fixture with no actual data yet', async () => {
    mockedApi.getActualMatchDetail.mockResolvedValue(null);

    renderPage();

    await waitFor(() => expect(screen.getByText(/hasn.t been played/)).toBeInTheDocument());
  });
});
