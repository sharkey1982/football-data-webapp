import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PriceRiskPage from '../pages/fpl/PriceRiskPage';
import * as api from '../lib/priceRiskApi';

vi.mock('../lib/priceRiskApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/priceRiskApi');
  return { ...actual, getPriceChangeRisk: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const row = (over: Partial<api.PriceRisk>): api.PriceRisk => ({
  fpl_player_id: 1, web_name: 'Popular', slug: 'popular', team_name: 'Arsenal',
  position_label: 'MID', price: 6.1, ownership: 40, transfers_in: 20000, transfers_out: 0,
  net_transfers: 20000, pressure: 0.5, direction: 'rise', ...over,
});

describe('PriceRiskPage', () => {
  it('ranks by pressure, not raw net transfers', async () => {
    mocked.getPriceChangeRisk.mockResolvedValue([
      // Ordering comes from the RPC; the page must not re-sort by net
      // transfers, which would put the 40%-owned player first and be
      // exactly wrong -- the same 20,000 moves are noise at that
      // ownership and decisive at 2%.
      row({ fpl_player_id: 2, web_name: 'Differential', slug: 'diff', ownership: 2, net_transfers: 20000, pressure: 10 }),
      row({}),
    ]);

    render(<MemoryRouter><PriceRiskPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Differential')).toBeInTheDocument());
    const names = screen.getAllByRole('rowheader').map((r) => r.textContent ?? '');
    expect(names[0]).toContain('Differential');
  });

  it('states plainly that it ranks risk rather than predicting a change', async () => {
    mocked.getPriceChangeRisk.mockResolvedValue([row({})]);
    render(<MemoryRouter><PriceRiskPage /></MemoryRouter>);

    // FPL's threshold isn't public, so claiming a definite change would
    // be overclaiming. Pinned, because it's the kind of caveat that
    // quietly disappears in a later edit.
    await waitFor(() => expect(screen.getByText(/doesn.t publish its price-change threshold/)).toBeInTheDocument());
    expect(screen.getByText(/no figure here is a prediction/)).toBeInTheDocument();
  });

  it('separates risers from fallers rather than mixing directions', async () => {
    mocked.getPriceChangeRisk.mockResolvedValue([
      row({ fpl_player_id: 3, web_name: 'Riser', slug: 'riser', direction: 'rise', net_transfers: 5000 }),
      row({ fpl_player_id: 4, web_name: 'Faller', slug: 'faller', direction: 'fall', net_transfers: -5000, pressure: -4 }),
    ]);
    render(<MemoryRouter><PriceRiskPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Under pressure to rise/ })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /Under pressure to fall/ })).toBeInTheDocument();
    expect(screen.getByText('Riser')).toBeInTheDocument();
    expect(screen.getByText('Faller')).toBeInTheDocument();
  });
});
