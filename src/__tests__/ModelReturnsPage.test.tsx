import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ModelReturnsPage from '../pages/football/ModelReturnsPage';
import * as api from '../lib/bettingApi';
import { totalReturns, sampleIsThin, type BettingReturnRow } from '../lib/bettingApi';

vi.mock('../lib/bettingApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/bettingApi');
  return { ...actual, getBettingReturns: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const row = (over: Partial<BettingReturnRow> = {}): BettingReturnRow => ({
  selection: 'Draw',
  bets: 44,
  staked: 440,
  returned: 468,
  profit: 28,
  roi_pct: 6.4,
  wins: 12,
  hit_rate_pct: 27.3,
  avg_odds: 3.94,
  avg_edge_pct: 7.8,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getBettingReturns.mockResolvedValue([row(), row({ selection: 'Home', bets: 24, staked: 240, profit: -61.2, roi_pct: -25.5, wins: 7 })]);
});

const renderPage = () => render(<MemoryRouter><ModelReturnsPage /></MemoryRouter>);

describe('Model returns page', () => {
  it('shows each selection with its bets, profit and ROI', async () => {
    renderPage();
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Draw')).toBeInTheDocument();
    expect(table.getByText('+6.4%')).toBeInTheDocument();
    expect(table.getByText('−25.5%')).toBeInTheDocument();
  });

  it('totals the bets and stakes across selections', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByText('68')).toBeInTheDocument();      // 44 + 24 bets
    expect(screen.getByText('£680')).toBeInTheDocument();    // 440 + 240 staked
  });

  it('refuses to imply a verdict on a thin sample', async () => {
    renderPage();
    expect(await screen.findByText(/Too few bets to mean anything/)).toBeInTheDocument();
  });

  it('changing the edge asks the database again with the new threshold', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: '10%' }));
    await waitFor(() => expect(mocked.getBettingReturns).toHaveBeenLastCalledWith(expect.objectContaining({ edge: 0.1 })));
  });

  it('the price basis and closing choice are passed through, not assumed', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Median' }));
    await waitFor(() => expect(mocked.getBettingReturns).toHaveBeenLastCalledWith(expect.objectContaining({ bestPrice: false })));
    await user.click(screen.getByRole('button', { name: 'Earliest price' }));
    await waitFor(() => expect(mocked.getBettingReturns).toHaveBeenLastCalledWith(expect.objectContaining({ closing: false })));
  });

  it('defaults to this season and labels last season as retro-fitted', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    expect(mocked.getBettingReturns).toHaveBeenLastCalledWith(expect.objectContaining({ seasonId: 13 }));
    expect(screen.queryByText(/Retro-fitted/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2025/26' }));
    await waitFor(() => expect(mocked.getBettingReturns).toHaveBeenLastCalledWith(expect.objectContaining({ seasonId: 12 })));
    expect(screen.getByText(/Retro-fitted/)).toBeInTheDocument();
  });

  it('says so plainly when nothing clears the edge', async () => {
    mocked.getBettingReturns.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No bet clears that edge/)).toBeInTheDocument();
  });

  it('totals and the thin-sample rule are computed, not hard-coded', () => {
    const t = totalReturns([row({ bets: 10, staked: 100, profit: 5 }), row({ bets: 10, staked: 100, profit: -15 })]);
    expect(t.bets).toBe(20);
    expect(t.profit).toBe(-10);
    expect(t.roiPct).toBe(-5);
    expect(sampleIsThin(499)).toBe(true);
    expect(sampleIsThin(500)).toBe(false);
  });
});
