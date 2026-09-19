import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import FormationsPage from '../pages/fpl/FormationsPage';
import * as api from '../lib/formationApi';

vi.mock('../lib/formationApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/formationApi');
  return { ...actual, getFormationSlots: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const slot = (over: Partial<api.FormationSlot>): api.FormationSlot => ({
  source_formation_code: '2', canonical_formation: '4-4-2', source_formation_slot: '9',
  starts: 251, minutes: 20000, goals: 100, open_play_goals: 69, assists: 26,
  key_passes: 50, shots: 671, big_chances: 60, opp_box_touches: 1106,
  set_piece_assists: 10, goal_share: 0.3115, assist_share: 0.1145, open_play_goal_share: 0.3151, ...over,
});

describe('FormationsPage', () => {
  it('shows contribution shares as percentages', async () => {
    mocked.getFormationSlots.mockResolvedValue([
      slot({}),
      slot({ source_formation_slot: '1', goals: 1, open_play_goals: 2, assists: 0, opp_box_touches: 0, goal_share: 0.0031, assist_share: 0 }),
    ]);

    render(<MemoryRouter><FormationsPage /></MemoryRouter>);
    // 31.15% of the formation's goals from one slot -- the share is the
    // interpretable claim, and it's read from the view rather than
    // recomputed here.
    // Matched on content rather than exact node text: the same figure
    // appears on the pitch marker and in the table, and toFixed rounding
    // of 0.3115 can land on either side of the boundary.
    await waitFor(() =>
      expect(screen.getAllByText((t) => t.includes('31.1%') || t.includes('31.2%')).length).toBeGreaterThan(0)
    );
  });

  it('compares one position across formations, with sample sizes shown', async () => {
    mocked.getFormationSlots.mockResolvedValue([
      slot({ source_formation_code: '2', canonical_formation: '4-4-2', starts: 251 }),
      // A tiny-sample formation: its bar may top the chart, so the start
      // count has to be visible or it reads as a finding rather than noise.
      slot({ source_formation_code: '17', canonical_formation: null, starts: 3, goal_share: 0.9 }),
    ]);

    render(<MemoryRouter><FormationsPage /></MemoryRouter>);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'ST' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'ST' }));

    expect(screen.getByText(/across every formation/)).toBeInTheDocument();
    expect(screen.getByText('3 starts')).toBeInTheDocument();
    expect(screen.getByText('Formation 17')).toBeInTheDocument();
  });
});
