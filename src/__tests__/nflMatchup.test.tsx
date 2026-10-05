import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as mu from '../lib/nflMatchup';
import NflMatchProjectionsPage from '../pages/nfl/NflMatchProjectionsPage';
import type { NflGame, NflTeamSeason } from '../lib/nflApi';
import type { NflProjection } from '../lib/nflProjections';
import { THEMES } from '../lib/journey';

vi.mock('../lib/nflMatchup', async () => {
  const actual = await vi.importActual<typeof mu>('../lib/nflMatchup');
  return { ...actual, loadMatchup: vi.fn(), loadMatchupIndex: vi.fn() };
});
const mocked = mu as unknown as Record<string, ReturnType<typeof vi.fn>>;

const wk = (team: string, position: string, ry: number, recy: number, rtd: number, rectd: number, targets = 0, carries = 0, game_id = 'g1') =>
  ({ team, position, season: 2026, season_type: 'REG', rushing_yards: ry, receiving_yards: recy, rushing_tds: rtd, receiving_tds: rectd, targets, carries, game_id });

const DET = [wk('DET', 'RB', 300, 100, 4, 1, 12, 70), wk('DET', 'RB', 150, 20, 2, 0, 4, 30), wk('DET', 'WR', 0, 250, 0, 1, 30), wk('DET', 'TE', 0, 80, 0, 0, 10), wk('DET', 'QB', 30, 0, 0, 0, 0, 8, 'g2')];
const MIA = [wk('MIA', 'RB', 120, 40, 0, 0, 6, 40), wk('MIA', 'WR', 0, 520, 0, 4, 55), wk('MIA', 'TE', 0, 90, 0, 1, 12), wk('MIA', 'QB', 20, 0, 1, 0, 0, 5)];

describe('NFL match-up maths', () => {
  it('splits yards and touchdowns by position and labels the style', () => {
    const det = mu.buildProfile('DET', 2026, DET);
    expect(det.games).toBe(2);
    expect(det.yards).toEqual({ QB: 30, RB: 570, WR: 250, TE: 80 });
    expect(det.tds).toEqual({ QB: 0, RB: 7, WR: 1, TE: 0 });
    expect(mu.reliance(det).label).toBe('Run-led');
    const mia = mu.buildProfile('MIA', 2026, MIA);
    expect(mu.reliance(mia).label).toBe('Receiver-led');
    expect(mu.relianceSentence(mia, 'Miami Dolphins')).toBe('Miami Dolphins get 20% of their yards and 0% of their touchdowns from running backs, 77% and 83% from receivers and tight ends.');
  });

  it('expected points from the line, and the key line-up by slot with ruled-out players last', () => {
    expect(mu.impliedPoints({ spread_line: 3, total_line: 47 })).toEqual({ home: 25, away: 22 });
    expect(mu.impliedPoints({ spread_line: null, total_line: 47 })).toBeNull();
    const p = (id: string, position: string, proj: number, injury_status: string | null = null) => ({ player_id: id, player_name: id, player_slug: id, position, proj_ppr: proj, team_slug: 'det', injury_status }) as unknown as NflProjection;
    const l = mu.lineup([p('a', 'RB', 20, 'Out'), p('b', 'RB', 12), p('c', 'FB', 3), p('d', 'QB', 18), p('e', 'WR', 15)], 'det');
    expect(l.map((x) => `${x.slot}:${x.player?.player_id ?? '-'}`)).toEqual(['QB:d', 'RB1:b', 'RB2:c', 'WR1:e', 'WR2:-', 'WR3:-', 'TE:-', 'K:-']);
  });
});

const game = { game_id: '2026_05_MIA_DET', season: 2026, game_type: 'REG', week: 5, gameday: '2026-10-11', kickoff_at: '2026-10-11T17:00:00Z', home_franchise: 'DET', home_slug: 'detroit-lions', home_name: 'Detroit Lions', home_short: 'Lions', away_franchise: 'MIA', away_slug: 'miami-dolphins', away_name: 'Miami Dolphins', away_short: 'Dolphins', home_score: null, away_score: null, neutral_site: false, spread_line: 7, total_line: 49 } as unknown as NflGame;
const stats = (f: string, over: Partial<NflTeamSeason>) => ({ franchise: f, season: 2026, games: 4, points_for: 120, plays: 260, attempts: 140, sacks_suffered: 8, dst_points: 28, ...over }) as unknown as NflTeamSeason;
const proj = (id: string, slug: string, position: string, ppr: number) => ({ game_id: game.game_id, player_id: id, player_slug: id, player_name: id, position, team_slug: slug, method: 'np1', proj_ppr: ppr, proj_half: ppr, proj_std: ppr, low_ppr: ppr / 2, high_ppr: ppr * 1.5, injury_status: null }) as unknown as NflProjection;

describe('NFL Match Projections page', () => {
  it('shows the team inputs, the yards/TD split and the line-ups side by side', async () => {
    mocked.loadMatchup.mockResolvedValue({
      game, season: 2026,
      projections: [proj('Goff', 'detroit-lions', 'QB', 19), proj('Gibbs', 'detroit-lions', 'RB', 21), proj('Tua', 'miami-dolphins', 'QB', 16), proj('Hill', 'miami-dolphins', 'WR', 17)],
      home: { profile: mu.buildProfile('DET', 2026, DET), stats: stats('DET', { points_for: 130 }), allowed: [{ position: 'WR', ppr_per_game: 40, ppr_rank: 3 }] },
      away: { profile: mu.buildProfile('MIA', 2026, MIA), stats: stats('MIA', { points_for: 80 }), allowed: [{ position: 'RB', ppr_per_game: 30, ppr_rank: 2 }] },
    });
    render(<MemoryRouter initialEntries={['/nfl/match-projections/2026_05_MIA_DET']}><Routes><Route path="/nfl/match-projections/:gameId" element={<NflMatchProjectionsPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('nfl-matchup-kpis')).toBeInTheDocument());
    await act(async () => {});
    const kpis = screen.getByTestId('nfl-matchup-kpis');
    const row = (label: string) => within(kpis).getByRole('rowheader', { name: label }).closest('tr')!;
    expect(row('Expected points').textContent).toBe('21.0Expected points28.0');
    expect(row('Style').textContent).toBe('Receiver-ledStyleRun-led');
    // Away (MIA) WRs face the Detroit defence, which gives up the 3rd most to WRs.
    expect(row('Opp. defence v WRs').textContent).toContain('40.0 (3rd)');
    expect(row('Opp. defence v RBs').textContent).toContain('30.0 (2nd)');
    expect(screen.getAllByTestId('nfl-matchup-profile')).toHaveLength(2);
    const slots = screen.getAllByTestId('nfl-matchup-slot');
    expect(slots[0].textContent).toMatch(/^Tua16\.0.*QB19\.0.*Goff$/);
    expect(slots[1].textContent).toContain('Gibbs');
    expect(screen.getByTestId('nfl-matchup-totals').textContent).toContain('33.0');
    fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
  });

  it('lists this week’s games and sits after Player Projections in Predict, as in FPL', async () => {
    mocked.loadMatchupIndex.mockResolvedValue([{ game, home: 61.2, away: 48.9, players: 30 }]);
    render(<MemoryRouter initialEntries={['/nfl/match-projections']}><Routes><Route path="/nfl/match-projections" element={<NflMatchProjectionsPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId('nfl-matchup-card')).toHaveLength(1));
    const card = screen.getByTestId('nfl-matchup-card');
    expect(card.getAttribute('href')).toBe('/nfl/match-projections/2026_05_MIA_DET');
    expect(card.textContent).toContain('48.9');
    expect(card.textContent).toContain('28.0');
    const predict = THEMES.nfl.stages.find((s) => s.key === 'predict')!.links.map((l) => l.label);
    expect(predict.slice(0, 2)).toEqual(['Player Projections', 'Match Projections']);
  });

  it('shows a dash, not zero, for a team that plays an earlier game first', async () => {
    mocked.loadMatchupIndex.mockResolvedValue([{ game, home: null, away: 48.9, players: 12 }]);
    render(<MemoryRouter initialEntries={['/nfl/match-projections']}><Routes><Route path="/nfl/match-projections" element={<NflMatchProjectionsPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId('nfl-matchup-card')).toHaveLength(1));
    const card = screen.getByTestId('nfl-matchup-card');
    expect(card.textContent).toContain('–');
    expect(card.textContent).not.toContain('0.0');
  });
});
