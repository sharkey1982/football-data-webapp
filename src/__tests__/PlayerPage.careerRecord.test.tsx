// ============================================================================
// src/__tests__/PlayerPage.careerRecord.test.tsx
//
// The canonical player page (/fpl/players/:slug) is what nearly every
// player-name link on the site points to, and it used to be the THINNER
// of the two player pages -- projections only, while the much richer
// career view sat at /fpl/player-scout/:slug reachable only from its own
// search.
//
// These cover the merge: the canonical page now carries the same career
// record component the scout page uses, and degrades properly when there
// isn't one to show.
// ============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PlayerPage from '../pages/fpl/PlayerPage';
import * as pageApi from '../lib/fplPlayerPageApi';
import * as scoutApi from '../lib/playerScoutApi';

vi.mock('../lib/fplPlayerPageApi', async () => {
  const actual = await vi.importActual<typeof pageApi>('../lib/fplPlayerPageApi');
  return { ...actual, getPlayerBySlug: vi.fn(), getPlayerSeason: vi.fn() };
});
vi.mock('../lib/playerScoutApi', async () => {
  const actual = await vi.importActual<typeof scoutApi>('../lib/playerScoutApi');
  return { ...actual, getPlayerCareer: vi.fn() };
});

const mockedPageApi = pageApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedScoutApi = scoutApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const PROFILE = {
  fpl_player_id: 100,
  fpl_code: 118748,
  slug: 'bukayo-saka',
  web_name: 'Saka',
  full_name: 'Bukayo Saka',
  canonical_team_id: 1,
  team_name: 'Arsenal',
  team_slug: 'arsenal',
  position_label: 'Midfielder',
  price: 10.1,
};

function careerSeason(overrides: Partial<scoutApi.PlayerSeason>): scoutApi.PlayerSeason {
  return {
    season_id: 12,
    season_slug: '2526',
    team_name: 'Arsenal',
    start_cost: 100,
    end_cost: 103,
    total_points: 200,
    minutes: 3000,
    goals_scored: 10,
    assists: 12,
    points_per_start_million: 20,
    ...overrides,
  } as scoutApi.PlayerSeason;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/fpl/players/bukayo-saka']}>
      <Routes>
        <Route path="/fpl/players/:slug" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PlayerPage career record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPageApi.getPlayerBySlug.mockResolvedValue(PROFILE);
    mockedPageApi.getPlayerSeason.mockResolvedValue([]);
    mockedScoutApi.getPlayerCareer.mockResolvedValue([]);
  });

  it('fetches the career by fpl_code, not fpl_player_id', async () => {
    mockedScoutApi.getPlayerCareer.mockResolvedValue([
      careerSeason({ season_id: 11, season_slug: '2425', total_points: 150 }),
      careerSeason({ season_id: 12, season_slug: '2526', total_points: 200 }),
    ]);
    renderPage();
    // FPL reassigns element ids every season, so a cross-season record
    // keyed on fpl_player_id (100) would be wrong -- it must use
    // fpl_code (118748), which is what player_identity is built on.
    await waitFor(() => expect(mockedScoutApi.getPlayerCareer).toHaveBeenCalledWith(118748));
    expect(mockedScoutApi.getPlayerCareer).not.toHaveBeenCalledWith(100);
  });

  it('shows the season-by-season record alongside the projections', async () => {
    mockedScoutApi.getPlayerCareer.mockResolvedValue([
      careerSeason({ season_id: 11, season_slug: '2425', total_points: 150, goals_scored: 7 }),
      careerSeason({ season_id: 12, season_slug: '2526', total_points: 200, goals_scored: 10 }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Every season so far')).toBeInTheDocument());
    // Both seasons' points render -- this is the content that previously
    // only existed on the scout page.
    expect(screen.getAllByText('150').length).toBeGreaterThan(0);
    expect(screen.getAllByText('200').length).toBeGreaterThan(0);
    // And the deep link to the fuller view is offered.
    expect(screen.getByRole('link', { name: 'Full career record' })).toHaveAttribute(
      'href',
      '/fpl/player-scout/bukayo-saka'
    );
  });

  it('renders nothing extra for a player with a single season, rather than a one-row comparison', async () => {
    mockedScoutApi.getPlayerCareer.mockResolvedValue([careerSeason({ season_id: 12 })]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/Saka/)).toBeInTheDocument());
    // One season is not a comparison: a single full-width bar and a
    // one-row table say less than the page already shows.
    expect(screen.queryByText('Every season so far')).not.toBeInTheDocument();
  });

  it('still renders the projections page when the career fetch fails', async () => {
    mockedScoutApi.getPlayerCareer.mockRejectedValue(new Error('career lookup exploded'));
    renderPage();
    // The career record is a secondary section. A failure there must not
    // take out the page a projection link pointed at.
    await waitFor(() => expect(screen.getByText(/Saka/)).toBeInTheDocument());
    expect(screen.queryByText('Every season so far')).not.toBeInTheDocument();
  });
});
