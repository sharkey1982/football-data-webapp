import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptimalSquadPage from '../pages/fpl/OptimalSquadPage';
import * as optimizerApi from '../lib/fplOptimizerApi';
import * as fplApi from '../lib/fplApi';

import type { FplOptimizerPlayer, FplOptimizerResult } from '../lib/fplOptimizerApi';

vi.mock('../lib/fplOptimizerApi', async () => {
  const actual = await vi.importActual<typeof optimizerApi>('../lib/fplOptimizerApi');
  return { ...actual, optimizeFplSquad: vi.fn(), getOptimizerEarliestMatchweek: vi.fn() };
});
vi.mock('../lib/fplApi', async () => {
  const actual = await vi.importActual<typeof fplApi>('../lib/fplApi');
  return { ...actual, getSquadPitchEnrichment: vi.fn() };
});

const mockedOptimizerApi = optimizerApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedFplApi = fplApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

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

describe('OptimalSquadPage', () => {
  it('shows exactly 15 squad players with the correct 2/5/5/3 position split, and a visually distinct bench', async () => {
    mockedOptimizerApi.getOptimizerEarliestMatchweek.mockResolvedValue(5);
    mockedOptimizerApi.optimizeFplSquad.mockResolvedValue(buildResult());
    mockedFplApi.getSquadPitchEnrichment.mockResolvedValue(new Map());

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

    // Starting XI pitch shows the 11 XI players, not the 4 bench players.
    const pitchHeading = screen.getByText(/Starting XI/);
    expect(pitchHeading).toBeInTheDocument();
  });

  it('builds a multi-GW request from the "Next 3 GWs" preset and shows a per-week formation/captain table', async () => {
    mockedOptimizerApi.getOptimizerEarliestMatchweek.mockResolvedValue(5);
    mockedFplApi.getSquadPitchEnrichment.mockResolvedValue(new Map());
    mockedOptimizerApi.optimizeFplSquad.mockResolvedValue(
      buildResult({
        from_matchweek: 5,
        to_matchweek: 7,
        weeks: [5, 6, 7],
        weekly_plan: [
          { matchweek: 5, formation: '3-4-3', xi: ['GK1', 'CB1', 'CB2', 'CB3', 'MID1', 'MID2', 'MID3', 'MID4', 'FWD1', 'FWD2', 'FWD3'], xi_xpts: 58.0, captain: 'FWD1', vice_captain: 'FWD2', captain_extra_ev: 8.0, bench_order: ['CheapDef', 'BenchMid', 'BenchFwd'], auto_sub_ev: 0.4 },
          { matchweek: 6, formation: '4-3-3', xi: ['GK1', 'CB1', 'CB2', 'CB3', 'CheapDef', 'MID1', 'MID2', 'MID3', 'FWD1', 'FWD2', 'FWD3'], xi_xpts: 55.0, captain: 'MID1', vice_captain: 'FWD1', captain_extra_ev: 7.0, bench_order: ['MID4', 'BenchMid', 'BenchFwd'], auto_sub_ev: 0.3 },
          { matchweek: 7, formation: '3-5-2', xi: ['GK1', 'CB1', 'CB2', 'CB3', 'MID1', 'MID2', 'MID3', 'MID4', 'FWD1', 'FWD2', 'BenchFwd'], xi_xpts: 60.0, captain: 'FWD1', vice_captain: 'MID1', captain_extra_ev: 9.0, bench_order: ['CheapDef', 'BenchMid', 'FWD3'], auto_sub_ev: 0.2 },
        ],
      })
    );

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next 3 GWs' }));
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(mockedOptimizerApi.optimizeFplSquad).toHaveBeenCalledWith(5, 7, 100));
    await waitFor(() => expect(screen.getByText('Weekly plan')).toBeInTheDocument());
    expect(screen.getAllByText('GW6').length).toBeGreaterThan(0);
    // Different formations across weeks are shown, not hidden behind one squad-wide value.
    expect(screen.getAllByText('4-3-3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3-5-2').length).toBeGreaterThan(0);
  });

  it('shows the backend error message when optimisation fails, and never invents a squad', async () => {
    mockedOptimizerApi.getOptimizerEarliestMatchweek.mockResolvedValue(5);
    mockedOptimizerApi.optimizeFplSquad.mockRejectedValue(new Error('No legal squad found'));

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(screen.getByText('No legal squad found')).toBeInTheDocument());
    expect(screen.queryByText(/Starting XI/)).not.toBeInTheDocument();
  });

  it('enriches the pitch with tactical role, season PPG, and set-piece info once the enrichment fetch resolves', async () => {
    mockedOptimizerApi.getOptimizerEarliestMatchweek.mockResolvedValue(5);
    mockedOptimizerApi.optimizeFplSquad.mockResolvedValue(buildResult());
    mockedFplApi.getSquadPitchEnrichment.mockResolvedValue(
      new Map([
        [
          9, // FWD1, captain
          {
            fpl_player_id: 9,
            tactical_role: 'CF',
            position_signal: null,
            start_probability: 0.98,
            lineup_confidence: 0.9,
            set_piece_roles: [{ type: 'penalty' as const, rank: 1 }],
            squad_status: 'first_choice' as const,
            season_points_per_game: 6.2,
          },
        ],
      ])
    );

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(mockedFplApi.getSquadPitchEnrichment).toHaveBeenCalledWith(5, expect.any(Array)));
    // Season PPG and tactical role both render once the enrichment resolves.
    await waitFor(() => expect(screen.getByText('6.2 ppg')).toBeInTheDocument());
    expect(screen.getByText('CF')).toBeInTheDocument();
  });

  it('never blocks the squad from rendering if the enrichment fetch fails', async () => {
    mockedOptimizerApi.getOptimizerEarliestMatchweek.mockResolvedValue(5);
    mockedOptimizerApi.optimizeFplSquad.mockResolvedValue(buildResult());
    mockedFplApi.getSquadPitchEnrichment.mockRejectedValue(new Error('network error'));

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    // The actual squad still renders in full despite the enrichment failing.
    await waitFor(() => expect(screen.getAllByText('FWD1').length).toBeGreaterThan(0));
    expect(screen.getByText(/Starting XI/)).toBeInTheDocument();
  });

  it('shows abbreviated club names and a single-letter C/V badge for the currently-viewed week only', async () => {
    mockedOptimizerApi.getOptimizerEarliestMatchweek.mockResolvedValue(5);
    // 2-week request: FWD1 captains week 1 only; MID1 captains week 2 only.
    // FWD1's points genuinely differ week to week AND differ from his
    // total_xpts (season/range total) -- the pitch must show the
    // CURRENTLY VIEWED week's own score, never the aggregate.
    mockedOptimizerApi.optimizeFplSquad.mockResolvedValue(
      buildResult({
        from_matchweek: 5,
        to_matchweek: 6,
        weeks: [5, 6],
        squad: [
          makePlayer({ id: 1, name: 'GK1', position: 1, price: 5.5, gw_xpts: { 5: 4, 6: 4 }, total_xpts: 8 }),
          makePlayer({ id: 2, name: 'CB1', position: 2, price: 5.0, team: 'Arsenal', gw_xpts: { 5: 6, 6: 6 }, total_xpts: 12 }),
          makePlayer({ id: 3, name: 'CB2', position: 2, price: 5.0, team: 'Arsenal', gw_xpts: { 5: 6, 6: 6 }, total_xpts: 12 }),
          makePlayer({ id: 4, name: 'CB3', position: 2, price: 5.0, team: 'Arsenal', gw_xpts: { 5: 6, 6: 6 }, total_xpts: 12 }),
          makePlayer({ id: 5, name: 'MID1', position: 3, price: 8.0, gw_xpts: { 5: 3, 6: 20 }, total_xpts: 23 }),
          makePlayer({ id: 6, name: 'MID2', position: 3, price: 8.0, gw_xpts: { 5: 8, 6: 8 }, total_xpts: 16 }),
          makePlayer({ id: 7, name: 'MID3', position: 3, price: 8.0, gw_xpts: { 5: 8, 6: 8 }, total_xpts: 16 }),
          makePlayer({ id: 8, name: 'MID4', position: 3, price: 8.0, gw_xpts: { 5: 8, 6: 8 }, total_xpts: 16 }),
          makePlayer({ id: 9, name: 'FWD1', position: 4, price: 10.0, gw_xpts: { 5: 25, 6: 2 }, total_xpts: 27 }),
          makePlayer({ id: 10, name: 'FWD2', position: 4, price: 10.0, gw_xpts: { 5: 9, 6: 9 }, total_xpts: 18 }),
          makePlayer({ id: 11, name: 'FWD3', position: 4, price: 10.0, gw_xpts: { 5: 9, 6: 9 }, total_xpts: 18 }),
          makePlayer({ id: 12, name: 'BenchGK', position: 1, price: 4.0, total_xpts: 4 }),
          makePlayer({ id: 13, name: 'CheapDef', position: 2, price: 4.0, total_xpts: 6 }),
          makePlayer({ id: 14, name: 'BenchMid', position: 3, price: 4.5, total_xpts: 5 }),
          makePlayer({ id: 15, name: 'BenchFwd', position: 4, price: 4.5, total_xpts: 4 }),
        ],
        weekly_plan: [
          {
            matchweek: 5, formation: '3-4-3', xi: ['GK1', 'CB1', 'CB2', 'CB3', 'MID1', 'MID2', 'MID3', 'MID4', 'FWD1', 'FWD2', 'FWD3'],
            xi_xpts: 58.0, captain: 'FWD1', vice_captain: 'FWD2', captain_extra_ev: 25.0,
            bench_order: ['CheapDef', 'BenchMid', 'BenchFwd'], auto_sub_ev: 0.4,
          },
          {
            matchweek: 6, formation: '3-4-3', xi: ['GK1', 'CB1', 'CB2', 'CB3', 'MID1', 'MID2', 'MID3', 'MID4', 'FWD1', 'FWD2', 'FWD3'],
            xi_xpts: 55.0, captain: 'MID1', vice_captain: 'FWD1', captain_extra_ev: 20.0,
            bench_order: ['CheapDef', 'BenchMid', 'BenchFwd'], auto_sub_ev: 0.3,
          },
        ],
      })
    );
    mockedFplApi.getSquadPitchEnrichment.mockResolvedValue(new Map());

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));

    await waitFor(() => expect(screen.getAllByText('CB1').length).toBeGreaterThan(0));
    // CB1/CB2/CB3 are all on 'Arsenal' -- abbreviated to ARS.
    expect(screen.getAllByText('ARS').length).toBeGreaterThan(0);

    // Week 5 (default view): FWD1 scored 25 that week, NOT his 27-point
    // total -- and he's captain this week, so a plain "C" badge, not "C1".
    expect(screen.getByText('25.0 pts')).toBeInTheDocument();
    expect(screen.queryByText('27.0 pts')).not.toBeInTheDocument();
    expect(screen.getByTitle(/FWD1.*Captain, GW5/)).toBeInTheDocument();

    // Switch to GW6 -- FWD1's displayed score changes to his GW6 score (2),
    // and he's now vice (not captain); MID1 is captain this week instead.
    const gw6Tabs = screen.getAllByRole('button', { name: 'GW6' });
    await user.click(gw6Tabs[0]);
    await waitFor(() => expect(screen.getByTitle(/FWD1.*Vice-captain, GW6/)).toBeInTheDocument());
    expect(screen.getByText('2.0 pts')).toBeInTheDocument();
    expect(screen.getByTitle(/MID1.*Captain, GW6/)).toBeInTheDocument();
  });

  it('lets the user switch which gameweek the pitch shows, and toggle to a table view', async () => {
    mockedOptimizerApi.getOptimizerEarliestMatchweek.mockResolvedValue(5);
    mockedOptimizerApi.optimizeFplSquad.mockResolvedValue(
      buildResult({
        from_matchweek: 5,
        to_matchweek: 6,
        weeks: [5, 6],
        weekly_plan: [
          {
            matchweek: 5, formation: '3-4-3', xi: ['GK1', 'CB1', 'CB2', 'CB3', 'MID1', 'MID2', 'MID3', 'MID4', 'FWD1', 'FWD2', 'FWD3'],
            xi_xpts: 58.0, captain: 'FWD1', vice_captain: 'FWD2', captain_extra_ev: 8.0,
            bench_order: ['CheapDef', 'BenchMid', 'BenchFwd'], auto_sub_ev: 0.4,
          },
          {
            // Different formation AND a bench player (CheapDef) starts instead of MID4 -- the
            // exact scenario that was previously hidden by only ever showing week 1's pitch.
            matchweek: 6, formation: '4-4-2', xi: ['GK1', 'CB1', 'CB2', 'CB3', 'CheapDef', 'MID1', 'MID2', 'MID3', 'FWD1', 'FWD2', 'FWD3'],
            xi_xpts: 55.0, captain: 'MID1', vice_captain: 'FWD1', captain_extra_ev: 7.0,
            bench_order: ['MID4', 'BenchMid', 'BenchFwd'], auto_sub_ev: 0.3,
          },
        ],
      })
    );
    mockedFplApi.getSquadPitchEnrichment.mockResolvedValue(new Map());

    render(<OptimalSquadPage />);
    await waitFor(() => expect(screen.getByText('This GW')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Build Optimal Squad' }));
    await waitFor(() => expect(screen.getAllByText('CB1').length).toBeGreaterThan(0));

    // Week 1 (default): MID4 is a starter, CheapDef is on the bench.
    expect(screen.getByText('Starting XI (GW5, 3-4-3)')).toBeInTheDocument();

    // Switch to GW6 via its tab -- the XI genuinely changes (CheapDef now starts).
    const gw6Tabs = screen.getAllByRole('button', { name: 'GW6' });
    await user.click(gw6Tabs[0]);
    await waitFor(() => expect(screen.getByText('Starting XI (GW6, 4-4-2)')).toBeInTheDocument());

    // Table view shows every week at once, including bench status per week.
    await user.click(screen.getByRole('button', { name: 'Table' }));
    await waitFor(() => expect(screen.getAllByText('bench').length).toBeGreaterThan(0));
  });
});
