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

const line = (franchise: string, week: number, game_id: string, over: Partial<mu.TeamGameLine> = {}): mu.TeamGameLine => ({
  season: 2026, week, game_id, franchise, points_for: 24, points_against: 20, pass_yards_net: 220, rushing_yards: 110, passing_tds: 2, rushing_tds: 1,
  giveaways: 1, fg_made: 2, fg_att: 2, opp_pass_yards_net: 200, opp_rushing_yards: 100, opp_passing_tds: 1, opp_rushing_tds: 1, opp_fg_made: 1, takeaways: 2, ...over,
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
      teamGames: [line('DET', 1, 'g1', { pass_yards_net: 250 }), line('MIA', 1, 'g2', { opp_pass_yards_net: 300 })],
      playerActuals: [],
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
    expect(card.getAttribute('href')).toBe('/nfl/match-projections/2026_05_mia_det');
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

  it('stat lines: average before the game, what the opponent allows, and the actual once played', () => {
    const lines = [
      line('DET', 1, 'a', { pass_yards_net: 200 }), line('DET', 2, 'b', { pass_yards_net: 300 }),
      line('MIA', 1, 'c', { opp_pass_yards_net: 280, takeaways: 3 }), line('MIA', 3, 'd', { opp_pass_yards_net: 220, takeaways: 1 }),
      line('DET', 5, game.game_id, { pass_yards_net: 333 }), line('MIA', 5, game.game_id),
    ];
    const s = mu.statLines(lines, 'DET', 'MIA', game);
    const pass = s.lines.find((l) => l.key === 'pass')!;
    expect(s.games).toBe(2);
    expect(pass.avg).toBe(250);
    expect(pass.oppAllows).toBe(250);
    expect(pass.actual).toBe(333);
    expect(s.lines.find((l) => l.key === 'to')!.oppAllows).toBe(2);
    expect(mu.actualLine({ player_id: 'x', pts_std: 0, pts_half: 0, pts_ppr: 0, passing_yards: 289, passing_tds: 2, rushing_yards: 14, rushing_tds: 0, receptions: 0, receiving_yards: 0, receiving_tds: 0, fg_made: 0, fg_att: 0 })).toBe('289 pass yds, 2 TD \u00b7 14 rush yds');
  });

  it('after the game: final score, actual stat lines and actual points beside the projection', async () => {
    const played = { ...game, home_score: 31, away_score: 17 } as unknown as NflGame;
    mocked.loadMatchup.mockResolvedValue({
      game: played, season: 2026,
      projections: [proj('Goff', 'detroit-lions', 'QB', 19), proj('Tua', 'miami-dolphins', 'QB', 16)],
      home: { profile: mu.buildProfile('DET', 2026, DET), stats: stats('DET', {}), allowed: [] },
      away: { profile: mu.buildProfile('MIA', 2026, MIA), stats: stats('MIA', {}), allowed: [] },
      teamGames: [line('DET', 1, 'g1'), line('MIA', 1, 'g2'), line('DET', 5, played.game_id, { pass_yards_net: 301 }), line('MIA', 5, played.game_id, { pass_yards_net: 188 })],
      playerActuals: [{ player_id: 'Goff', pts_std: 20, pts_half: 20, pts_ppr: 24.5, passing_yards: 301, passing_tds: 3, rushing_yards: 0, rushing_tds: 0, receptions: 0, receiving_yards: 0, receiving_tds: 0, fg_made: 0, fg_att: 0 }],
    });
    render(<MemoryRouter initialEntries={['/nfl/match-projections/2026_05_MIA_DET']}><Routes><Route path="/nfl/match-projections/:gameId" element={<NflMatchProjectionsPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('nfl-matchup-final')).toBeInTheDocument());
    expect(screen.getByTestId('nfl-matchup-final').textContent).toContain('Dolphins 17\u201331 Lions');
    const pass = screen.getAllByTestId('nfl-statline').find((r) => r.textContent!.includes('Passing yards'))!;
    expect(pass.textContent).toMatch(/^188/);
    expect(pass.textContent).toMatch(/301$/);
    const qb = screen.getAllByTestId('nfl-matchup-slot')[0];
    expect(qb.textContent).toContain('24.5');
    expect(qb.textContent).toContain('proj 19.0');
    expect(qb.textContent).toContain('301 pass yds, 3 TD');
    expect(qb.textContent).toContain('did not play'); // Tua has no actual row
  });
});
