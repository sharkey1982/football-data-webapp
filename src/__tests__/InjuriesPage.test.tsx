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
  position_label: 'DEF', price: 4.5, ownership: 6.4, total_points: 25, status: 'i', chance_next_round: 0,
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

  it('surfaces high scorers with short absences, and ignores fringe players', async () => {
    mocked.getInjuryReport.mockResolvedValue([
      row({}), // 25 pts, misses 1 -- the actionable case
      // Out indefinitely: no return date, so no fixture count. Must not
      // appear as something to hold.
      row({ fpl_player_id: 9, web_name: 'LongTerm', slug: 'longterm', total_points: 40, return_date: null, fixtures_missed: null }),
      // Short absence but never scores -- not worth surfacing either.
      row({ fpl_player_id: 8, web_name: 'Fringe', slug: 'fringe', total_points: 0, fixtures_missed: 1 }),
    ]);
    render(<MemoryRouter><InjuriesPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Worth holding' })).toBeInTheDocument());
    const panel = screen.getByRole('heading', { name: 'Worth holding' }).closest('section')!;
    expect(panel.textContent).toMatch(/Mendy/);
    expect(panel.textContent).not.toMatch(/LongTerm/);
    expect(panel.textContent).not.toMatch(/Fringe/);
  });
});
