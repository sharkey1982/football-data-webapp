import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import OptimalSquadPage from '../pages/fpl/OptimalSquadPage';
import * as optimizerApi from '../lib/fplOptimizerApi';
import type { FplOptimizerResult, FplOptimizerPlayer } from '../lib/fplOptimizerApi';

import * as scoutApi from '../lib/playerScoutApi';
import * as seasonApi from '../lib/fplSeasonApi';
import * as fplApi from '../lib/fplApi';

vi.mock('../lib/fplOptimizerApi', async () => {
  const a = await vi.importActual<typeof optimizerApi>('../lib/fplOptimizerApi');
  return { ...a, optimizeFplSquad: vi.fn(), getOptimizerEarliestMatchweek: vi.fn() };
});
vi.mock('../lib/playerScoutApi', async () => {
  const a = await vi.importActual<typeof scoutApi>('../lib/playerScoutApi');
  return { ...a, listScoutPlayers: vi.fn() };
});
vi.mock('../lib/fplSeasonApi', async () => {
  const a = await vi.importActual<typeof seasonApi>('../lib/fplSeasonApi');
  return { ...a, getDefaultMatchweek: vi.fn() };
});
vi.mock('../lib/fplApi', async () => {
  const a = await vi.importActual<typeof fplApi>('../lib/fplApi');
  return { ...a, getSquadPitchEnrichment: vi.fn() };
});

const mOpt = optimizerApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mScout = scoutApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mSeason = seasonApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mFpl = fplApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const HAALAND = {
  fpl_code: 223094, slug: 'erling-haaland', fpl_player_id: 411, web_name: 'Haaland',
  full_name: 'Erling Haaland', team_name: 'Manchester City', team_id: 43, element_type: 4,
  now_cost: 156, total_points: 33, minutes: 360, goals_scored: 4, assists: 0,
  clean_sheets: 0, bonus: 9, selected_by_percent: 60, points_per_million: 2.1, seasons_played: 4,
};

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

// Shaped exactly like the real v1.6 backend response: squad is the flat
// 15-man list with no starter/bench label; membership in a given week's
// XI comes from that week's weekly_plan.xi (names only).

function buildResult(overrides: Partial<FplOptimizerResult> = {}): FplOptimizerResult {
  const xiNames = ['GK1', 'CB1', 'CB2', 'CB3', 'MID1', 'MID2', 'MID3', 'MID4', 'FWD1', 'FWD2', 'FWD3'];
  const squad: FplOptimizerPlayer[] = [
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
    objective_xpts: 62.3,
    squad,
    weekly_plan: [
      {
        matchweek: 5,
        formation: '3-4-3',
        xi: xiNames,
        xi_xpts: 58.0,
        captain: 'FWD1',
        vice_captain: 'FWD2',
        captain_extra_ev: 8.0,
        bench_order: ['CheapDef', 'BenchMid', 'BenchFwd'],
        auto_sub_ev: 0.4,
      },
    ],
    projection_model: 'leaguewide_v6',
    version: 'v1.6',
    notes: ['Transfers between GWs not simulated'],
    ...overrides,
  };
}

const renderPage = () => render(<MemoryRouter><OptimalSquadPage /></MemoryRouter>);

describe('optimiser forced picks', () => {
  beforeEach(() => {
    mSeason.getDefaultMatchweek.mockResolvedValue(5);
    mOpt.getOptimizerEarliestMatchweek.mockResolvedValue(1);
    mFpl.getSquadPitchEnrichment.mockResolvedValue(new Map());
    mScout.listScoutPlayers.mockResolvedValue([HAALAND]);
  });

  it('sends a forced-in player to the solver', async () => {
    const r = buildResult();
    r.squad[8] = { ...r.squad[8], id: 411, name: 'Haaland' };
    mOpt.optimizeFplSquad.mockResolvedValue(r);

    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/force in/i), 'haaland');
    await waitFor(() => expect(screen.getByRole('button', { name: /Haaland/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Haaland/ }));
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() =>
      expect(mOpt.optimizeFplSquad).toHaveBeenCalledWith(5, 5, expect.any(Number), [411], [])
    );
  });

  it('reports plainly when the solver IGNORES a forced pick', async () => {
    // The edge function's source isn't in this repo, so whether it
    // honours these fields is unverified. The page has to be able to
    // say "it didn't" rather than quietly showing a squad that doesn't
    // match the request.
    // Haaland (411) is forced in but nowhere in the returned squad.
    mOpt.optimizeFplSquad.mockResolvedValue(buildResult());

    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/force in/i), 'haaland');
    await waitFor(() => expect(screen.getByRole('button', { name: /Haaland/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Haaland/ }));
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(screen.getByText(/Constraints NOT honoured/)).toBeInTheDocument());
    expect(screen.getByText(/Forced in but absent: Haaland/)).toBeInTheDocument();
  });

  it('confirms when the solver DOES obey', async () => {
    const ok = buildResult();
    ok.squad[8] = { ...ok.squad[8], id: 411, name: 'Haaland' };
    mOpt.optimizeFplSquad.mockResolvedValue(ok);

    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/force in/i), 'haaland');
    await waitFor(() => expect(screen.getByRole('button', { name: /Haaland/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Haaland/ }));
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(screen.getByText(/Constraints honoured/)).toBeInTheDocument());
  });
});
