import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PlayerProjectionsTablePage from '../pages/fpl/PlayerProjectionsTablePage';
import * as fplSeasonApi from '../lib/fplSeasonApi';
import * as fplPlayerTableApi from '../lib/fplPlayerTableApi';

vi.mock('../lib/fplSeasonApi', async () => {
  const actual = await vi.importActual<typeof fplSeasonApi>('../lib/fplSeasonApi');
  return { ...actual, getDefaultMatchweek: vi.fn() };
});
vi.mock('../lib/fplPlayerTableApi', async () => {
  const actual = await vi.importActual<typeof fplPlayerTableApi>('../lib/fplPlayerTableApi');
  return { ...actual, getPlayerGameweekPointsRange: vi.fn() };
});

const mockedSeasonApi = fplSeasonApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedTableApi = fplPlayerTableApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function baseRow(overrides: Partial<fplPlayerTableApi.PlayerGameweekPoints>): fplPlayerTableApi.PlayerGameweekPoints {
  return {
    fpl_player_id: 1,
    web_name: 'Haaland',
    team_id: 18,
    team_name: 'Man City',
    fpl_position: 4,
    fpl_position_label: 'FWD',
    matchweek: 5,
    actual_points: null,
    projected_points: null,
    xpts_appearance: null,
    xpts_goals: null,
    xpts_assists: null,
    xpts_clean_sheet: null,
    xpts_saves: null,
    xpts_defensive_contribution: null,
    xpts_cards_own_goals: null,
    xpts_bonus: null,
    xpts_goals_conceded: null,
    xpts_penalties: null,
    actual_contribution: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/fpl/player-points']}>
      <Routes>
        <Route path="/fpl/player-points" element={<PlayerProjectionsTablePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PlayerProjectionsTablePage', () => {
  it('shows actual points in bold for a played gameweek and projected in italic for one not yet played', async () => {
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(5);
    mockedTableApi.getPlayerGameweekPointsRange.mockResolvedValue([
      baseRow({ matchweek: 5, actual_points: 12, projected_points: null }),
      baseRow({ matchweek: 6, actual_points: null, projected_points: 7.3, xpts_goals: 4.5, xpts_appearance: 1.8 }),
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Haaland')).toBeInTheDocument());

    const actualCell = screen.getByText('12.0');
    expect(actualCell.className).toContain('font-semibold');
    const projectedCell = screen.getByText('7.3');
    expect(projectedCell.className).toContain('italic');
  });

  it('switches to the contribution view and shows summed xPts components instead of per-gameweek totals', async () => {
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(5);
    mockedTableApi.getPlayerGameweekPointsRange.mockResolvedValue([
      baseRow({ matchweek: 5, projected_points: 5, xpts_goals: 3, xpts_appearance: 2 }),
      baseRow({ matchweek: 6, projected_points: 6, xpts_goals: 4, xpts_appearance: 2 }),
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Haaland')).toBeInTheDocument());

    fireEvent.click(screen.getByText('By contribution'));
    // Goals summed across both gameweeks: 3 + 4 = 7.00
    await waitFor(() => expect(screen.getByText('7.00')).toBeInTheDocument());
    // Appearance summed: 2 + 2 = 4.00
    expect(screen.getByText('4.00')).toBeInTheDocument();
  });

  it('filters by search text', async () => {
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(5);
    mockedTableApi.getPlayerGameweekPointsRange.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Haaland', matchweek: 5, projected_points: 8 }),
      baseRow({ fpl_player_id: 2, web_name: 'Saka', matchweek: 5, projected_points: 6 }),
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Haaland')).toBeInTheDocument());
    expect(screen.getByText('Saka')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search player\u2026'), { target: { value: 'saka' } });
    expect(screen.queryByText('Haaland')).not.toBeInTheDocument();
    expect(screen.getByText('Saka')).toBeInTheDocument();
  });

  it('uses the real reconstructed breakdown for a played gameweek, not the projection, in the contribution view', async () => {
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(5);
    mockedTableApi.getPlayerGameweekPointsRange.mockResolvedValue([
      // GW5 played: actual_contribution present, should be used.
      baseRow({
        matchweek: 5,
        actual_points: 17,
        projected_points: null,
        actual_contribution: { appearance: 2, goals: 5, assists: 6, cleanSheet: 1, defensiveContribution: 0, saves: 0, bonus: 3, goalsConceded: 0, penalties: 0, cardsOwnGoals: 0 },
      }),
      // GW6 not played: falls back to the model's own xpts_* breakdown.
      baseRow({ matchweek: 6, actual_points: null, projected_points: 6, xpts_goals: 4 }),
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Haaland')).toBeInTheDocument());
    fireEvent.click(screen.getByText('By contribution'));

    // Goals column: 5 (real, GW5) + 4 (projected, GW6) = 9.00
    await waitFor(() => expect(screen.getByText('9.00')).toBeInTheDocument());
    // Assists column: 6 (real, GW5 only) + 0 = 6.00
    expect(screen.getByText('6.00')).toBeInTheDocument();
  });
});
