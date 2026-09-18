import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PlayerPage from '../pages/fpl/PlayerPage';
import * as playerApi from '../lib/fplPlayerPageApi';

vi.mock('../lib/fplPlayerPageApi', async () => {
  const actual = await vi.importActual<typeof playerApi>('../lib/fplPlayerPageApi');
  return { ...actual, getPlayerBySlug: vi.fn(), getPlayerSeason: vi.fn() };
});

const mocked = playerApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/fpl/players/${slug}`]}>
      <Routes>
        <Route path="/fpl/players/:slug" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const profile = {
  fpl_player_id: 1,
  slug: 'erling-haaland',
  web_name: 'Haaland',
  full_name: 'Erling Haaland',
  canonical_team_id: 10,
  team_name: 'Man City',
  team_slug: 'man-city',
  position_label: 'Forward',
  price: 15.2,
};

describe('PlayerPage', () => {
  it('renders the player\u2019s projections in a real semantic table, with a data-derived freshness timestamp', async () => {
    mocked.getPlayerBySlug.mockResolvedValue(profile);
    mocked.getPlayerSeason.mockResolvedValue([
      {
        matchweek: 5,
        kickoff_date: '2026-09-20',
        opponent_name: 'Sunderland',
        is_home: true,
        status: 'scheduled',
        projected_points: 7.34,
        expected_minutes: 88,
        actual_points: null,
        generated_at: '2026-09-17T22:34:09Z',
        model_version: 'leaguewide_v6',
      },
      {
        matchweek: 6,
        kickoff_date: '2026-10-11',
        opponent_name: 'Liverpool',
        is_home: false,
        status: 'scheduled',
        projected_points: 6.24,
        expected_minutes: 85,
        actual_points: null,
        generated_at: '2026-09-17T22:34:09Z',
        model_version: 'leaguewide_v6',
      },
    ]);

    renderAt('erling-haaland');

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Erling Haaland' })).toBeInTheDocument());

    // A genuine table, not styled divs -- this is what a crawler would get.
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Projected points' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'GW5' })).toBeInTheDocument();
    expect(screen.getByText('7.3')).toBeInTheDocument();

    // Total across upcoming gameweeks, stated in prose so it's answerable.
    expect(screen.getByText(/projected 13.6 points across the next 2 gameweeks/)).toBeInTheDocument();

    // Freshness comes from the projection data itself, and is a real
    // <time> element with a machine-readable datetime.
    const time = document.querySelector('time[datetime="2026-09-17T22:34:09Z"]');
    expect(time).not.toBeNull();
    expect(screen.getByText(/model leaguewide_v6/)).toBeInTheDocument();
  });

  it('shows a real not-found state for an unknown slug rather than an error', async () => {
    mocked.getPlayerBySlug.mockResolvedValue(null);
    mocked.getPlayerSeason.mockResolvedValue([]);

    renderAt('no-such-player');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Player not found' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Browse all players' })).toHaveAttribute('href', '/fpl/player-points');
  });
});
