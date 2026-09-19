import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import SetPiecesPage from '../pages/fpl/SetPiecesPage';
import * as api from '../lib/setPieceApi';

vi.mock('../lib/setPieceApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/setPieceApi');
  return { ...actual, getSetPieceTakers: vi.fn(), getSetPieceBreakdown: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const taker = (over: Partial<api.SetPieceTaker>): api.SetPieceTaker => ({
  team_id: 1, team_name: 'Arsenal', team_slug: 'arsenal', set_piece_type: 'penalty',
  player_name: 'Saka', rank: 1, confidence: 0.9, source_name: 'fpl',
  updated_at: '2026-09-18T00:00:00Z', ...over,
});

describe('SetPiecesPage', () => {
  it('shows penalties first and switches set-piece type', async () => {
    mocked.getSetPieceBreakdown.mockResolvedValue(null);
    mocked.getSetPieceTakers.mockResolvedValue([
      taker({ player_name: 'Saka', rank: 1, set_piece_type: 'penalty' }),
      taker({ player_name: 'Rice', rank: 2, set_piece_type: 'penalty' }),
      taker({ player_name: 'Odegaard', rank: 1, set_piece_type: 'corner_left' }),
    ]);

    render(
      <MemoryRouter>
        <SetPiecesPage />
      </MemoryRouter>
    );

    // Penalties lead -- worth the most, and the reason most people open
    // a page like this.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Penalties' })).toBeInTheDocument());
    expect(screen.getByText('Saka')).toBeInTheDocument();
    expect(screen.getByText('Rice')).toBeInTheDocument();
    expect(screen.queryByText('Odegaard')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Corners (left)' }));
    expect(screen.getByText('Odegaard')).toBeInTheDocument();
    expect(screen.queryByText('Saka')).not.toBeInTheDocument();
  });

  it('degrades to a message rather than an empty page when there is no data', async () => {
    mocked.getSetPieceBreakdown.mockResolvedValue(null);
    mocked.getSetPieceTakers.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <SetPiecesPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/No set-piece data is available/)).toBeInTheDocument());
  });

  it('finds every duty a player takes in one view, across types', async () => {
    mocked.getSetPieceBreakdown.mockResolvedValue(null);
    mocked.getSetPieceTakers.mockResolvedValue([
      taker({ player_name: 'Saka', rank: 1, set_piece_type: 'penalty' }),
      taker({ player_name: 'Saka', rank: 2, set_piece_type: 'corner_right' }),
      taker({ player_name: 'Rice', rank: 1, set_piece_type: 'direct_free_kick' }),
    ]);

    render(
      <MemoryRouter>
        <SetPiecesPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Penalties' })).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'Saka');

    // Both duties in one place -- the point of the search is not having
    // to click through every set-piece type to assemble one answer.
    // "Penalties" also appears as a filter button and section heading,
    // so scope to the search result card rather than the document.
    // Saka appears in the search results AND the grid below, so take the
    // first -- the search results render above the filters.
    const card = screen.getAllByText('Saka')[0].closest('div')!;
    expect(card.textContent).toMatch(/Penalties/);
    expect(card.textContent).toMatch(/Corners \(right\)/);
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
  });

  it('shows the set-piece type split, not just a combined total', async () => {
    mocked.getSetPieceTakers.mockResolvedValue([taker({})]);
    mocked.getSetPieceBreakdown.mockResolvedValue({
      goals: 916, goals_open_play: 635, goals_from_corners: 117,
      goals_from_direct_fk: 29, goals_from_set_play: 64, goals_from_penalties: 67,
      assists: 658, assist_corner: 88, assist_free_kick: 46, assist_throw_in: 15,
      penalties_taken: 100, corners_taken: 4321,
    });

    render(
      <MemoryRouter>
        <SetPiecesPage />
      </MemoryRouter>
    );

    // The whole point of re-extracting the workbook: penalties and
    // corners separated, not one "set pieces" bucket.
    await waitFor(() => expect(screen.getByText(/What each duty is actually worth/)).toBeInTheDocument());
    expect(screen.getAllByText('Penalties').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Corners').length).toBeGreaterThan(0);
    // Each figure appears both in the prose summary and on its bar.
    expect(screen.getAllByText(/12\.8%/).length).toBeGreaterThan(0); // corners
    expect(screen.getAllByText(/7\.3%/).length).toBeGreaterThan(0);  // penalties
  });
});
