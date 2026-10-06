import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as so from '../lib/nflSnapOutlook';
import NflSnapOutlookPage from '../pages/nfl/NflSnapOutlookPage';
import type { NflTeam } from '../lib/nflApi';
import { THEMES } from '../lib/journey';
import { LAYOUT_PAIRS } from '../lib/layoutPairs';

vi.mock('../lib/nflSnapOutlook', async () => {
  const actual = await vi.importActual<typeof so>('../lib/nflSnapOutlook');
  return { ...actual, loadOutlookTeams: vi.fn(), loadSnapOutlook: vi.fn() };
});
const mocked = so as unknown as Record<string, ReturnType<typeof vi.fn>>;

const DET: NflTeam = { franchise: 'DET', slug: 'detroit-lions', name: 'Detroit Lions', short_name: 'Lions', conference: 'NFC', division: 'North' };
const snap = (id: string, position: string, week: number, offense: number, team = 60): so.SnapRow => ({ player_id: id, player_name: id, player_slug: id.toLowerCase(), position, week, game_id: `g${week}`, offense_snaps: offense, team_offense_snaps: team });

// Gibbs steady; Vaki fading; Saylors rising; Pacheco signed, on the chart, no snaps yet.
const SNAPS = [
  snap('Gibbs', 'RB', 1, 45), snap('Gibbs', 'RB', 2, 50), snap('Gibbs', 'RB', 3, 42), snap('Gibbs', 'RB', 4, 52),
  snap('Vaki', 'RB', 1, 30), snap('Vaki', 'RB', 2, 25), snap('Vaki', 'RB', 3, 6), snap('Vaki', 'RB', 4, 3),
  snap('Saylors', 'FB', 3, 20), snap('Saylors', 'FB', 4, 22),
  snap('Goff', 'QB', 1, 60), snap('Goff', 'QB', 2, 60), snap('Goff', 'QB', 3, 60), snap('Goff', 'QB', 4, 60),
];
const dr = (id: string, position: string, depth: number, slot = 11): so.DepthRow => ({ player_id: id, player_name: id, position, slot, depth });
const input = {
  team: DET, season: 2026, snaps: SNAPS,
  usage: [{ player_id: 'Gibbs', week: 1, carries: 15, targets: 5 }, { player_id: 'Gibbs', week: 2, carries: 17, targets: 3 }],
  depthNow: [dr('Gibbs', 'RB', 1), dr('Saylors', 'RB', 2), dr('Vaki', 'RB', 3), dr('Pacheco', 'RB', 4), dr('Goff', 'QB', 1, 9)],
  depthBefore: [dr('Gibbs', 'RB', 1), dr('Vaki', 'RB', 2), dr('Saylors', 'RB', 3), dr('Goff', 'QB', 1, 9)],
  injuries: [{ player_id: 'Goff', injury_status: 'Questionable', injury: 'Ankle' }],
  asOf: '2026-10-06',
};

describe('NFL snap outlook maths', () => {
  it('shares, trend, depth, moves and roles', () => {
    const o = so.buildSnapOutlook(input);
    const p = (id: string) => o.players.find((x) => x.player_id === id)!;
    expect(o.weeks).toEqual([1, 2, 3, 4]);
    expect(p('Gibbs').shares.get(4)).toBeCloseTo(52 / 60);
    expect(p('Gibbs').role).toBe('Starter');
    expect(p('Gibbs').opportunities).toBe(20);
    expect(p('Vaki').trend).toBeCloseTo((6 + 3) / 120 - (30 + 25) / 120);
    expect(p('Vaki').role).toBe('Backup');
    expect(p('Saylors').position).toBe('RB'); // FB counts as RB
    expect(p('Saylors').role).toBe('Rotation');
    expect(p('Saylors').trend).toBeCloseTo((20 + 22) / 120);
    expect(p('Pacheco').seasonShare).toBeNull();
    expect(p('Pacheco').role).toBe('Depth');
    expect(p('Goff').role).toBe('Starter'); // questionable is not Out
    expect(o.gaining.map((x) => x.player_id)).toEqual(['Saylors']);
    expect(o.losing.map((x) => x.player_id)).toEqual(['Vaki']);
    expect(o.depthMoves.map((m) => `${m.player.player_id}:${m.from}->${m.to}`).sort()).toEqual(['Saylors:3->2', 'Vaki:2->3']); // moves within the top three only: Pacheco joins at RB4
    expect(so.buildSnapOutlook({ ...input, depthBefore: [] }).depthMoves).toEqual([]); // no earlier chart: no moves, not everyone "new"
    expect(so.roleOf(0.9, 1, 'Out')).toBe('Out');
    expect(so.roleOf(null, 1, null)).toBe('Starter');
  });
});

describe('NFL Snap Outlook page', () => {
  it('shows callouts, the position tables and the roles', async () => {
    mocked.loadOutlookTeams.mockResolvedValue([DET]);
    mocked.loadSnapOutlook.mockResolvedValue(so.buildSnapOutlook(input));
    render(<MemoryRouter initialEntries={['/nfl/snap-outlook?team=detroit-lions']}><Routes><Route path="/nfl/snap-outlook" element={<NflSnapOutlookPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId('nfl-outlook-row').length).toBeGreaterThan(0));
    expect(screen.getByTestId('nfl-outlook-gaining').textContent).toContain('Saylors');
    expect(screen.getByTestId('nfl-outlook-losing').textContent).toContain('Vaki');
    expect(screen.getByTestId('nfl-outlook-moves').textContent).toContain('RB3 → RB2');
    const rb = screen.getByRole('heading', { name: 'Running backs' }).closest('section')!;
    const rows = within(rb).getAllByTestId('nfl-outlook-row');
    expect(rows.map((r) => r.querySelector('th')!.textContent)).toEqual(['Gibbs', 'Saylors', 'Vaki', 'Pacheco']);
    expect(rows[0].textContent).toContain('87'); // week 4 share
    expect(screen.getByRole('heading', { name: 'Quarterbacks' }).closest('section')!.textContent).toContain('Q');
  });

  it('is in NFL Predict as the counterpart of FPL Minutes Outlook', () => {
    const predict = THEMES.nfl.stages.find((s) => s.key === 'predict')!.links.map((l) => l.label);
    expect(predict).toContain('Snap Outlook');
    expect(predict.indexOf('Snap Outlook')).toBeGreaterThan(predict.indexOf('Match Projections'));
    expect(predict.indexOf('Snap Outlook')).toBeLessThan(predict.indexOf('Fixture Heat Map'));
    expect(LAYOUT_PAIRS.find((p) => p.nflLabel === 'Snap Outlook')?.label).toBe('Minutes Outlook');
  });
});
