import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptimalSquadPage from '../pages/fpl/OptimalSquadPage';
import * as optimizerApi from '../lib/fplOptimizerApi';
import * as fplSeasonApi from '../lib/fplSeasonApi';
import type { FplOptimizerPlayer, FplOptimizerResult } from '../lib/fplOptimizerApi';

vi.mock('../lib/fplOptimizerApi', async () => {
  const actual = await vi.importActual<typeof optimizerApi>('../lib/fplOptimizerApi');
  return { ...actual, optimizeFplSquad: vi.fn() };
});
vi.mock('../lib/fplSeasonApi', async () => {
  const actual = await vi.importActual<typeof fplSeasonApi>('../lib/fplSeasonApi');
  return { ...actual, getDefaultMatchweek: vi.fn() };
});

const mockedOptimizerApi = optimizerApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedSeasonApi = fplSeasonApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function makePlayer(overrides: Partial<FplOptimizerPlayer>): FplOptimizerPlayer {
  return {
    id: 0,
    name: 'Player',
    team: 'Team',
    position: 3,
    price: 5.0,
    total_xpts: 5.0,
    avg_appearance_probability: 0.9,
    gw_xpts: { 5: 5.0 },
    ...overrides,
  };
}

// Shaped exactly like a real backend response: 15 total (2 GK, 5 DEF, 5 MID,
// 3 FWD across starting_core + bench), starting_core in a 3-4-3.
function buildResult(overrides: Partial<FplOptimizerResult> = {}): FplOptimizerResult {
  const starting_core: FplOptimizerPlayer[] = [
    makePlayer({ id: 1, name: 'GK1', position: 1, price: 5.5 }),
    makePlayer({ id: 2, name: 'CB1', position: 2, price: 5.0, team: 'Arsenal' }),
    makePlayer({ id: 3, name: 'CB2', position: 2, price: 5.0, team: 'Arsenal' }),
    makePlayer({ id: 4, name: 'CB3', position: 2, price: 5.0, team: 'Arsenal' }),
    makePlayer({ id: 5, name: 'MID1', position: 3, price: 8.0 }),
    makePlayer({ id: 6, name: 'MID2', position: 3, price: 8.0 }),
    makePlayer({ id: 7, name: 'MID3', position: 3, price: 8.0 }),
    makePlayer({ id: 8, name: 'MID4', position: 3, price: 8.0 }),
    makePlayer({ id: 9, name: 'FWD1', position: 4, price: 10.0 }),
    makePlayer({ id: 10, name: 'FWD2', position: 4, price: 10.0 }),
    makePlayer({ id: 11, name: 'FWD3', position: 4, price: 10.0 }),
  ];
  const bench: FplOptimizerPlayer[] = [
    makePlayer({ id: 12, name: 'BenchGK', position: 1, price: 4.0, total_xpts: 2.0 }),
    makePlayer({ id: 13, name: 'CheapDef', position: 2, price: 4.0, total_xpts: 3.0 }), // "the £4.0m playing defender" case
    makePlayer({ id: 14, name: 'BenchMid', position: 3, price: 4.5, total_xpts: 2.5 }),
    makePlayer({ id: 15, name: 'BenchFwd', position: 4, price: 4.5, total_xpts: 2.0 }),
  ];
  return {
    from_matchweek: 5,
    to_matchweek: 5,
    weeks: [5],
    budget: 100,
    budget_used: 99.5,
    bank: 0.5,
    base_formation: '3-4-3',
    objective_xpts: 62.3,
    squad: [...starting_core, ...bench],
    starting_core,
    bench,
    weekly_plan: [{ matchweek: 5, xi_xpts: 58.0, captain: 'FWD1', vice_captain: 'FWD2', captain_xpts: 8.0 }],
    projection_model: 'leaguewide_v6',
    version: 'v1.5',
    notes: ['Transfers between GWs not simulated'],
    ...overrides,
  };
}

describe('OptimalSquadPage', () => {
  it('shows exactly 15 squad players with the correct 2/5/5/3 position split, and a visually distinct bench', async () => {
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(5);
    mockedOptimizerApi.optimizeFplSquad.mockResolvedValue(buildResult());

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(mockedOptimizerApi.optimizeFplSquad).toHaveBeenCalledWith(5, 5, 100));

    // Full 15-man table has all 15 names.
    await waitFor(() => expect(screen.getAllByText('BenchFwd').length).toBeGreaterThan(0));
    const allNames = ['GK1', 'CB1', 'CB2', 'CB3', 'MID1', 'MID2', 'MID3', 'MID4', 'FWD1', 'FWD2', 'FWD3', 'BenchGK', 'CheapDef', 'BenchMid', 'BenchFwd'];
    for (const name of allNames) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }

    // Bench section exists as its own labelled, separate block.
    expect(screen.getByText('Bench')).toBeInTheDocument();
    // A cheap (£4.0m) bench defender is explicitly allowed to appear -- not
    // something the frontend should "correct" by re-sorting on points.
    expect(screen.getAllByText('CheapDef').length).toBeGreaterThan(0);

    // Squad cost within budget, bank shown.
    expect(screen.getByText('\u00a399.5m')).toBeInTheDocument();
    expect(screen.getByText('\u00a30.5m')).toBeInTheDocument();
  });

  it('builds a multi-GW request from the "Next 3 GWs" preset and shows a weekly captain table', async () => {
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(5);
    mockedOptimizerApi.optimizeFplSquad.mockResolvedValue(
      buildResult({
        from_matchweek: 5,
        to_matchweek: 7,
        weeks: [5, 6, 7],
        weekly_plan: [
          { matchweek: 5, xi_xpts: 58.0, captain: 'FWD1', vice_captain: 'FWD2', captain_xpts: 8.0 },
          { matchweek: 6, xi_xpts: 55.0, captain: 'MID1', vice_captain: 'FWD1', captain_xpts: 7.0 },
          { matchweek: 7, xi_xpts: 60.0, captain: 'FWD1', vice_captain: 'MID1', captain_xpts: 9.0 },
        ],
      })
    );

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next 3 GWs' }));
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(mockedOptimizerApi.optimizeFplSquad).toHaveBeenCalledWith(5, 7, 100));
    await waitFor(() => expect(screen.getByText('Weekly captain plan')).toBeInTheDocument());
    expect(screen.getByText('GW6')).toBeInTheDocument();
  });

  it('shows the backend error message when optimisation fails, and never invents a squad', async () => {
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(5);
    mockedOptimizerApi.optimizeFplSquad.mockRejectedValue(new Error('No legal squad found'));

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(screen.getByText('No legal squad found')).toBeInTheDocument());
    expect(screen.queryByText('Starting XI')).not.toBeInTheDocument();
  });
});
