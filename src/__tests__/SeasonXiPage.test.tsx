import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SeasonXiPage from '../pages/fpl/SeasonXiPage';
import * as api from '../lib/seasonXiApi';

vi.mock('../lib/seasonXiApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/seasonXiApi');
  return { ...actual, getSeasonBestXi: vi.fn(), getSeasonValueLeaders: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const p = (over: Partial<api.SeasonXiPlayer>): api.SeasonXiPlayer => ({
  season_id: 12, fpl_code: 1, web_name: 'Gabriel', team_name: 'Arsenal',
  element_type: 2, start_cost: 60, total_points: 209, ...over,
});

describe('SeasonXiPage', () => {
  it('shows August prices, not end-of-season prices', async () => {
    mocked.getSeasonValueLeaders.mockResolvedValue([]);
    mocked.getSeasonBestXi.mockResolvedValue([p({}), p({ fpl_code: 2, web_name: 'Haaland', element_type: 4, start_cost: 140, total_points: 239 })]);

    render(<MemoryRouter><SeasonXiPage /></MemoryRouter>);

    // Gabriel's August price. Using his £7.3m closing price would let a
    // hindsight squad spend money his own 209 points created -- the one
    // thing a real manager can't do.
    await waitFor(() => expect(screen.getAllByText(/£6\.0m/).length).toBeGreaterThan(0));
    expect(screen.getByText(/created by the 209 points/)).toBeInTheDocument();
  });

  it('totals points and cost across the XI', async () => {
    mocked.getSeasonValueLeaders.mockResolvedValue([]);
    mocked.getSeasonBestXi.mockResolvedValue([
      p({ fpl_code: 1, total_points: 100, start_cost: 50 }),
      p({ fpl_code: 2, total_points: 200, start_cost: 100 }),
    ]);
    render(<MemoryRouter><SeasonXiPage /></MemoryRouter>);
// Rendered as "300 points" / "£15.0m" inside <strong>, so match the
    // node's own text rather than the bare number.
    await waitFor(() => expect(screen.getByText(/300 points/)).toBeInTheDocument());
    expect(screen.getByText(/£15\.0m/)).toBeInTheDocument();
  });

  it('states it is an XI, not a fifteen', async () => {
    mocked.getSeasonValueLeaders.mockResolvedValue([]);
    mocked.getSeasonBestXi.mockResolvedValue([p({})]);
    render(<MemoryRouter><SeasonXiPage /></MemoryRouter>);
    // Bench autosubs need gameweek data that isn't imported, so
    // claiming a full squad would overstate what was computed.
    await waitFor(() => expect(screen.getByText(/XI rather than a full fifteen/)).toBeInTheDocument());
  });
});
