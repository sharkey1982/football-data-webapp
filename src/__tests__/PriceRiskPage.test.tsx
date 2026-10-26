import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PriceRiskPage from '../pages/fpl/PriceRiskPage';
import * as api from '../lib/priceRiskApi';

vi.mock('../lib/priceRiskApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/priceRiskApi');
  return { ...actual, getPriceChangeRisk: vi.fn(), getPriceRecord: vi.fn(), getRecentPriceChanges: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const row = (over: Partial<api.PriceRisk>): api.PriceRisk => ({
  fpl_player_id: 1, web_name: 'Popular', slug: 'popular', team_name: 'Arsenal',
  position_label: 'MID', price: 6.1, ownership: 40, transfers_in: 20000, transfers_out: 0,
  net_transfers: 20000, pressure: 60, progress: 60, projected_next: 70, direction: 'rise', outlook: 'building',
  updated_at: '2026-10-26T21:47:00Z', ...over,
});

const record: api.PriceRecord = {
  from_night: '2026-09-28', to_night: '2026-10-25', nights: 28,
  expected_rises: 30, rose: 30, expected_falls: 200, fell: 197, possible: 40, possible_changed: 26,
  rises: 45, rises_expected: 30, falls: 220, falls_expected: 197,
};

beforeEach(() => {
  mocked.getPriceRecord.mockResolvedValue(record);
  mocked.getRecentPriceChanges.mockResolvedValue([]);
});

function section(name: RegExp) {
  return screen.getByRole('region', { name });
}

describe('PriceRiskPage (FPL price predictor)', () => {
  it('splits players into expected tonight, could go tonight and closest to the line', async () => {
    mocked.getPriceChangeRisk.mockResolvedValue([
      row({ fpl_player_id: 1, web_name: 'Konsa', pressure: 131, progress: 131, outlook: 'expected' }),
      row({ fpl_player_id: 2, web_name: 'Bogle', pressure: 97.8, progress: 97.8, projected_next: 102.8, outlook: 'possible' }),
      row({ fpl_player_id: 3, web_name: 'Gvardiol', pressure: -92, progress: -92, projected_next: -95, direction: 'fall', outlook: 'close' }),
    ]);
    render(<MemoryRouter><PriceRiskPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Konsa')).toBeInTheDocument());
    expect(within(section(/Expected tonight/)).getByText('Konsa')).toBeInTheDocument();
    expect(within(section(/Could go tonight/)).getByText('Bogle')).toBeInTheDocument();
    expect(within(section(/Closest to the line/)).getByText('Gvardiol')).toBeInTheDocument();
    expect(within(section(/Closest to the line/)).getByText('−92%')).toBeInTheDocument();
  });

  it('says these are FPL’s figures, not ours, and shows the running record', async () => {
    mocked.getPriceChangeRisk.mockResolvedValue([row({})]);
    render(<MemoryRouter><PriceRiskPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText(/These are FPL.s figures, not ours/)).toBeInTheDocument());
    const rec = section(/How often FPL.s predictor is right/);
    expect(rec).toHaveTextContent('Over the last 28 nights');
    expect(rec).toHaveTextContent('30 of 30 players at 100% or more rose');
    expect(rec).toHaveTextContent('197 of 200');
  });

  it('ranks by progress across both directions, so the closest to a change leads', async () => {
    mocked.getPriceChangeRisk.mockResolvedValue([
      row({ fpl_player_id: 1, web_name: 'SmallRiser', pressure: 55, progress: 55 }),
      row({ fpl_player_id: 2, web_name: 'BigFaller', pressure: -88, progress: -88, direction: 'fall' }),
      row({ fpl_player_id: 3, web_name: 'MidRiser', pressure: 70, progress: 70 }),
    ]);
    render(<MemoryRouter><PriceRiskPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('BigFaller')).toBeInTheDocument());

    const names = within(section(/Closest to the line/)).getAllByRole('rowheader').map((r) => r.textContent ?? '');
    expect(names[0]).toContain('BigFaller');
    expect(names[1]).toContain('MidRiser');
    expect(names[2]).toContain('SmallRiser');
  });

  it('filters by direction', async () => {
    mocked.getPriceChangeRisk.mockResolvedValue([
      row({ fpl_player_id: 1, web_name: 'Riser', pressure: 80, progress: 80 }),
      row({ fpl_player_id: 2, web_name: 'Faller', pressure: -80, progress: -80, direction: 'fall' }),
    ]);
    render(<MemoryRouter><PriceRiskPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Riser')).toBeInTheDocument());
    expect(screen.getByText('Faller')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Rising/ }));
    expect(screen.getByText('Riser')).toBeInTheDocument();
    expect(screen.queryByText('Faller')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Falling/ }));
    expect(screen.getByText('Faller')).toBeInTheDocument();
    expect(screen.queryByText('Riser')).not.toBeInTheDocument();
  });

  it('lists last night’s changes with FPL’s figure the evening before', async () => {
    mocked.getPriceChangeRisk.mockResolvedValue([row({})]);
    mocked.getRecentPriceChanges.mockResolvedValue([
      { night: '2026-10-25', fpl_player_id: 9, web_name: 'Konsa', slug: 'konsa', team_name: 'Aston Villa', position_label: 'DEF',
        price_before: 4.6, price_after: 4.7, ownership: 19.6, progress: 131 },
    ]);
    render(<MemoryRouter><PriceRiskPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('region', { name: /Changed overnight after Sun 25 Oct/ })).toBeInTheDocument());
    const s = section(/Changed overnight/);
    expect(within(s).getByText('Konsa')).toBeInTheDocument();
    expect(s).toHaveTextContent('£4.6m → £4.7m');
    expect(s).toHaveTextContent('131%');
  });
});
