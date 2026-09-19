import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import SetPiecesPage from '../pages/fpl/SetPiecesPage';
import * as api from '../lib/setPieceApi';

vi.mock('../lib/setPieceApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/setPieceApi');
  return { ...actual, getSetPieceTakers: vi.fn(), getSetPieceBreakdown: vi.fn(), getSetPieceIndex: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const taker = (over: Partial<api.SetPieceTaker>): api.SetPieceTaker => ({
  team_id: 1, team_name: 'Arsenal', team_slug: 'arsenal', set_piece_type: 'penalty',
  player_name: 'Saka', rank: 1, confidence: 0.9, source_name: 'fpl',
  updated_at: '2026-09-18T00:00:00Z', ...over,
});

describe('SetPiecesPage', () => {
  it('shows every duty type per club at once, and lets a type be toggled off', async () => {
    mocked.getSetPieceBreakdown.mockResolvedValue(null);
    mocked.getSetPieceIndex.mockResolvedValue([]);
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

    // All duties for a club shown together -- the point of the
    // restructure. Penalty and corner takers appear at the same time.
    await waitFor(() => expect(screen.getByText('Saka')).toBeInTheDocument());
    expect(screen.getByText('Rice')).toBeInTheDocument();
    expect(screen.getByText('Odegaard')).toBeInTheDocument();

    // Types are toggles, not tabs: switching corners off removes only
    // the corner taker.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Corners (left)' }));
    expect(screen.queryByText('Odegaard')).not.toBeInTheDocument();
    expect(screen.getByText('Saka')).toBeInTheDocument();
  });

  it('degrades to a message rather than an empty page when there is no data', async () => {
    mocked.getSetPieceBreakdown.mockResolvedValue(null);
    mocked.getSetPieceIndex.mockResolvedValue([]);
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
    mocked.getSetPieceIndex.mockResolvedValue([]);
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
    await waitFor(() => expect(screen.getAllByText('Saka').length).toBeGreaterThan(0));

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
    // Rice appears in the club grid below (all duties now show at once),
    // so scope the exclusion to the search result card rather than the
    // whole document.
    expect(card.textContent).not.toMatch(/Rice/);
  });

  it('shows the set-piece type split, not just a combined total', async () => {
    mocked.getSetPieceTakers.mockResolvedValue([taker({})]);
    mocked.getSetPieceBreakdown.mockResolvedValue({
      goals: 916, goals_open_play: 635, goals_from_corners: 117,
      goals_from_direct_fk: 29, goals_from_set_play: 64, goals_from_penalties: 67,
      assists: 658, assist_corner: 88, assist_free_kick: 46, assist_throw_in: 15,
      penalties_taken: 100, corners_taken: 4321,
    });
    mocked.getSetPieceIndex.mockResolvedValue([]);

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
    expect(screen.getAllByText(/13%/).length).toBeGreaterThan(0); // corners
    expect(screen.getAllByText(/7%/).length).toBeGreaterThan(0);  // penalties
  });

  it('refuses to switch off the last remaining type', async () => {
    mocked.getSetPieceBreakdown.mockResolvedValue(null);
    mocked.getSetPieceIndex.mockResolvedValue([]);
    mocked.getSetPieceTakers.mockResolvedValue([taker({ set_piece_type: 'penalty' })]);

    render(
      <MemoryRouter>
        <SetPiecesPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Saka')).toBeInTheDocument());

    // Turn everything off except penalties, then try penalties too. An
    // empty selection would render a blank page that reads as broken
    // rather than as a deliberate filter.
    const user = userEvent.setup();
    for (const label of ['Direct free kicks', 'Corners (left)', 'Corners (right)']) {
      await user.click(screen.getByRole('button', { name: label }));
    }
    await user.click(screen.getByRole('button', { name: 'Penalties' }));
    expect(screen.getByRole('button', { name: 'Penalties' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Saka')).toBeInTheDocument();
  });

  it('ranks the index by weighted duty, not by number of duties', async () => {
    mocked.getSetPieceBreakdown.mockResolvedValue(null);
    mocked.getSetPieceTakers.mockResolvedValue([taker({})]);
    mocked.getSetPieceIndex.mockResolvedValue([
      // Fewer duties but a penalty: must outrank the corner-only taker.
      // Counting duties alike is exactly what the index exists to avoid.
      { team_id: 1, team_name: 'Arsenal', player_name: 'PenTaker', duties: 1, index_score: 40, detail: 'penalty #1' },
      { team_id: 2, team_name: 'Chelsea', player_name: 'CornerOnly', duties: 2, index_score: 22, detail: 'corner left #1, corner right #1' },
    ]);

    render(
      <MemoryRouter>
        <SetPiecesPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/Set-piece index/)).toBeInTheDocument());
    const panel = screen.getByText(/Set-piece index/).closest('section')!;
    const order = panel.textContent ?? '';
    expect(order.indexOf('PenTaker')).toBeLessThan(order.indexOf('CornerOnly'));
    // The caveat that it's a ranking, not expected points.
    expect(panel.textContent).toMatch(/not an expected-points figure/);
  });
});
