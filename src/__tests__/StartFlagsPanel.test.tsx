import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const rows = [
  { fixture_id: 1, kickoff_date: '2026-10-31', matchweek: 9, team: 'Man Utd', fpl_player_id: 440, web_name: 'Zirkzee',
    raw_probability: 0.9, probability: 0.9, capped: false, starts_last: 0, avail_last: 5, depth_rank: 2, tactical_role: 'CF', role_source: 'fpl_position_fallback' },
  { fixture_id: 2, kickoff_date: '2026-11-07', matchweek: 10, team: 'Spurs', fpl_player_id: 9, web_name: 'Later',
    raw_probability: 0.7, probability: 0.4, capped: true, starts_last: 1, avail_last: 4, depth_rank: 2, tactical_role: 'LW', role_source: 'manual' },
];

vi.mock('../lib/supabase', () => {
  const q = { select: () => q, order: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(r) };
  return { supabase: { from: () => q } };
});

import { StartFlagsPanel } from '../components/fpl/StartFlagsPanel';

describe('StartFlagsPanel', () => {
  it('lists the next gameweek only, with the record behind each flag', async () => {
    render(<StartFlagsPanel />);
    await waitFor(() => expect(screen.getByText('Zirkzee')).toBeInTheDocument());
    expect(screen.getByText(/Check before the deadline \(GW9\)/)).toBeInTheDocument();
    expect(screen.queryByText('Later')).not.toBeInTheDocument();
    expect(screen.getByText('0 / 5')).toBeInTheDocument();
    expect(screen.getByText('FPL position only')).toBeInTheDocument();
  });
});
