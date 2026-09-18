import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InjuriesPage from '../pages/fpl/InjuriesPage';
import * as api from '../lib/injuryApi';

vi.mock('../lib/injuryApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/injuryApi');
  return { ...actual, getInjuryReport: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const row = (over: Partial<api.InjuryRow>): api.InjuryRow => ({
  fpl_player_id: 1, web_name: 'Mendy', slug: 'mendy', team_id: 5, team_name: 'Hull',
  position_label: 'DEF', price: 4.5, ownership: 6.4, status: 'i', chance_next_round: 0,
  news: 'Concussion - Expected back 11 Oct', return_date: '2026-10-11', fixtures_missed: 1,
  next_fixture_date: '2026-10-03', ...over,
});

describe('InjuriesPage', () => {
  it('shows unknown, not zero, when no return date was stated', async () => {
    mocked.getInjuryReport.mockResolvedValue([
      row({ fpl_player_id: 2, web_name: 'Elanga', news: 'Unspecified injury - Unknown return date', return_date: null, fixtures_missed: null }),
    ]);

    render(<MemoryRouter><InjuriesPage /></MemoryRouter>);

    // "0" would read as "misses nothing" -- the opposite of the truth
    // for an injury with no known end date.
    await waitFor(() => expect(screen.getByText('unknown')).toBeInTheDocument());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('highlights absences the fixture calendar absorbs', async () => {
    mocked.getInjuryReport.mockResolvedValue([row({})]);
    render(<MemoryRouter><InjuriesPage /></MemoryRouter>);

    // Out for three weeks but missing one fixture, because the
    // international break covers most of it -- the insight a bare status
    // flag can never give.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cushioned by the break' })).toBeInTheDocument());
    expect(screen.getByText(/misses/)).toBeInTheDocument();
  });
});
