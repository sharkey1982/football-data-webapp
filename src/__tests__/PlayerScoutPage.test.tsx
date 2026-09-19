import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import PlayerScoutPage from '../pages/fpl/PlayerScoutPage';
import * as api from '../lib/playerScoutApi';

vi.mock('../lib/playerScoutApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/playerScoutApi');
  return { ...actual, searchPlayers: vi.fn(), getPlayerCareer: vi.fn(), getPlayerBySlug: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

/** Both routes, because selecting a search result NAVIGATES to the
 * player's own URL now -- that's the point of the identity slug, and a
 * test rendering only the bare page would exercise a path users never
 * take. */
function renderScout(path = '/fpl/player-scout') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/fpl/player-scout" element={<PlayerScoutPage />} />
        <Route path="/fpl/player-scout/:slug" element={<PlayerScoutPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const hit = (over: Partial<api.PlayerSearchResult> = {}): api.PlayerSearchResult => ({
  slug: 'bukayo-saka', fpl_code: 223340, canonical_name: 'Bukayo Saka', latest_web_name: 'Saka',
  latest_team: 'Arsenal', element_type: 3, seasons_played: 4, career_points: 712,
  first_season: '2022-23', last_season: '2025-26', current_slug: 'bukayo-saka', ...over,
});
const identity = (over: Partial<api.PlayerIdentity> = {}): api.PlayerIdentity => ({
  fpl_code: 223340, slug: 'bukayo-saka', canonical_name: 'Bukayo Saka', latest_web_name: 'Saka',
  latest_team: 'Arsenal', element_type: 3, seasons_played: 4, career_points: 712,
  career_minutes: 9000, first_season: '2022-23', last_season: '2025-26',
  current_slug: 'bukayo-saka', ...over,
});
const season = (over: Partial<api.PlayerSeason> = {}): api.PlayerSeason => ({
  season_id: 12, season_slug: '2025-26', web_name: 'Saka', team_name: 'Arsenal', element_type: 3,
  start_cost: 100, end_cost: 100, total_points: 157, minutes: 2218, goals_scored: 7, assists: 10,
  clean_sheets: 12, bonus: 18, points_per_start_million: 15.7,
  points_early: 54, points_mid: 60, points_late: 43, ...over,
});

describe('PlayerScoutPage', () => {
  beforeEach(() => {
    mocked.searchPlayers.mockReset();
    mocked.getPlayerCareer.mockReset();
    mocked.getPlayerBySlug.mockReset();
  });

  it('navigates to the player’s own URL when a search result is chosen', async () => {
    mocked.searchPlayers.mockResolvedValue([hit()]);
    mocked.getPlayerBySlug.mockResolvedValue(identity());
    mocked.getPlayerCareer.mockResolvedValue([season(), season({ season_id: 11, season_slug: '2024-25', total_points: 127 })]);

    renderScout();
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'saka');
    await waitFor(() => expect(screen.getByText('Bukayo Saka')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Bukayo Saka/ }));

    // Resolved by slug, not by keeping the search result in state.
    await waitFor(() => expect(mocked.getPlayerBySlug).toHaveBeenCalledWith('bukayo-saka'));
    await waitFor(() => expect(screen.getByText('2024/25')).toBeInTheDocument());
  });

  it('resolves a player directly from the URL, without searching', async () => {
    mocked.searchPlayers.mockResolvedValue([]);
    mocked.getPlayerBySlug.mockResolvedValue(identity());
    mocked.getPlayerCareer.mockResolvedValue([season()]);

    renderScout('/fpl/player-scout/bukayo-saka');

    await waitFor(() => expect(screen.getByText('Bukayo Saka')).toBeInTheDocument());
    expect(mocked.searchPlayers).not.toHaveBeenCalled();
  });

  it('says so when a slug matches nobody, rather than showing an empty page', async () => {
    mocked.searchPlayers.mockResolvedValue([]);
    mocked.getPlayerBySlug.mockResolvedValue(null);
    renderScout('/fpl/player-scout/nobody-here');
    await waitFor(() => expect(screen.getByText(/No player at that address/)).toBeInTheDocument());
  });

  it('says plainly when a player has no current projections rather than linking nowhere', async () => {
    // Departed players are who the historic data is most interesting
    // about, so they must be reachable -- but a link to a projection
    // page that doesn't exist would 404.
    mocked.searchPlayers.mockResolvedValue([]);
    mocked.getPlayerBySlug.mockResolvedValue(identity({ canonical_name: 'Gone Player', current_slug: null }));
    mocked.getPlayerCareer.mockResolvedValue([season({ team_name: 'Burnley' })]);

    renderScout('/fpl/player-scout/gone-player');
    await waitFor(() => expect(screen.getByText(/no projections for them/)).toBeInTheDocument());
    const card = screen.getByText(/no projections for them/).closest('section')!;
    expect(card.querySelector('a')).toBeNull();
  });

  it('renders a dash for seasons with no gameweek detail imported', async () => {
    mocked.searchPlayers.mockResolvedValue([]);
    mocked.getPlayerBySlug.mockResolvedValue(identity());
    mocked.getPlayerCareer.mockResolvedValue([
      season({ points_early: null, points_mid: null, points_late: null }),
    ]);
    renderScout('/fpl/player-scout/bukayo-saka');
    // A zero-height bar chart would read as "scored nothing" rather
    // than "not imported".
    await waitFor(() => expect(screen.getByText('\u2014')).toBeInTheDocument());
  });
});
