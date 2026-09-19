import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import PlayerScoutPage from '../pages/fpl/PlayerScoutPage';
import * as api from '../lib/playerScoutApi';

vi.mock('../lib/playerScoutApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/playerScoutApi');
  return { ...actual, searchPlayers: vi.fn(), getPlayerCareer: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const hit = (over: Partial<api.PlayerSearchResult> = {}): api.PlayerSearchResult => ({
  fpl_code: 223340, canonical_name: 'Bukayo Saka', latest_web_name: 'Saka', latest_team: 'Arsenal',
  element_type: 3, seasons_played: 4, career_points: 712, first_season: '2022-23',
  last_season: '2025-26', current_slug: 'bukayo-saka', ...over,
});
const season = (over: Partial<api.PlayerSeason> = {}): api.PlayerSeason => ({
  season_id: 12, season_slug: '2025-26', web_name: 'Saka', team_name: 'Arsenal', element_type: 3,
  start_cost: 100, end_cost: 100, total_points: 157, minutes: 2218, goals_scored: 7, assists: 10,
  clean_sheets: 12, bonus: 18, points_per_start_million: 15.7,
  points_early: 54, points_mid: 60, points_late: 43, ...over,
});

describe('PlayerScoutPage', () => {
  it('searches, then shows the career once a player is chosen', async () => {
    mocked.searchPlayers.mockResolvedValue([hit()]);
    mocked.getPlayerCareer.mockResolvedValue([season(), season({ season_id: 11, season_slug: '2024-25', total_points: 127 })]);

    render(<MemoryRouter><PlayerScoutPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'saka');

    await waitFor(() => expect(screen.getByText('Bukayo Saka')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Bukayo Saka/ }));

// 2025/26 also appears in the "best season" summary line.
    await waitFor(() => expect(screen.getAllByText('2025/26').length).toBeGreaterThan(0));
    expect(screen.getByText('2024/25')).toBeInTheDocument();
  });

  it('says plainly when a player has no current projections rather than linking nowhere', async () => {
    // Departed players are exactly who the historic data is most
    // interesting about, so they must be reachable -- but a link to a
    // projection page that doesn't exist would 404.
    mocked.searchPlayers.mockResolvedValue([hit({ canonical_name: 'Gone Player', current_slug: null })]);
    mocked.getPlayerCareer.mockResolvedValue([season({ team_name: 'Burnley' })]);

    render(<MemoryRouter><PlayerScoutPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'gone');
    await waitFor(() => expect(screen.getByText('Gone Player')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Gone Player/ }));

    await waitFor(() => expect(screen.getByText(/no projections for them/)).toBeInTheDocument());
    // The page footer always carries a generic "Player projections"
    // link, so scope the check to the player's own card.
    const card = screen.getByText(/no projections for them/).closest('section')!;
    expect(card.querySelector('a')).toBeNull();
  });

  it('renders a dash for seasons with no gameweek detail imported', async () => {
    mocked.searchPlayers.mockResolvedValue([hit()]);
    mocked.getPlayerCareer.mockResolvedValue([
      season({ points_early: null, points_mid: null, points_late: null }),
    ]);
    render(<MemoryRouter><PlayerScoutPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'saka');
    await waitFor(() => expect(screen.getByText('Bukayo Saka')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Bukayo Saka/ }));
    // A zero-height bar chart would imply zero points rather than
    // "not imported".
    await waitFor(() => expect(screen.getByText('\u2014')).toBeInTheDocument());
  });
});
