import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import DigestPage from '../pages/fpl/DigestPage';
import * as api from '../lib/digestApi';

vi.mock('../lib/digestApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/digestApi');
  return { ...actual, getDailyDigest: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const e = (over: Partial<api.DigestEntry>): api.DigestEntry => ({
  change_type: 'price_rise', fpl_player_id: 1, web_name: 'Popular', slug: 'popular',
  team_name: 'Arsenal', position_label: 'MID', ownership: 40,
  old_value: '\u00a36.0m', new_value: '\u00a36.1m', detail: null,
  from_date: '2026-09-18', to_date: '2026-09-19', ...over,
});

describe('DigestPage', () => {
  it('keeps availability changes regardless of ownership, but filters small-fry price moves', async () => {
    mocked.getDailyDigest.mockResolvedValue([
      e({}),
      // Nobody owns them yet -- which is exactly why a new injury is
      // worth hearing early, so it must survive the filter.
      e({ fpl_player_id: 2, web_name: 'NewInjury', slug: 'newinj', change_type: 'availability', ownership: 0.3, old_value: 'a', new_value: 'i', detail: 'Hamstring' }),
      // A real price move for a player nobody owns: real, and irrelevant.
      e({ fpl_player_id: 3, web_name: 'Fringe', slug: 'fringe', change_type: 'price_fall', ownership: 0.4 }),
    ]);

    render(<MemoryRouter><DigestPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('NewInjury')).toBeInTheDocument());
    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.queryByText('Fringe')).not.toBeInTheDocument();

    // Everything is still reachable -- the filter is a default, not a
    // restriction.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Everything/ }));
    expect(screen.getByText('Fringe')).toBeInTheDocument();
  });

  it('leads with availability, which is the only change that can force a transfer', async () => {
    mocked.getDailyDigest.mockResolvedValue([
      e({ fpl_player_id: 5, web_name: 'Riser', slug: 'riser', change_type: 'price_rise', ownership: 30 }),
      e({ fpl_player_id: 6, web_name: 'Injured', slug: 'injured', change_type: 'availability', ownership: 30, detail: 'Knock' }),
    ]);
    render(<MemoryRouter><DigestPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Injured')).toBeInTheDocument());
    const body = document.body.textContent ?? '';
    expect(body.indexOf('Availability')).toBeLessThan(body.indexOf('Price rises'));
  });
});
