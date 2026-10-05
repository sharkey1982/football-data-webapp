import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as proj from '../lib/nflProjections';
import NflProjectionsPage from '../pages/nfl/NflProjectionsPage';
import NflGamePage from '../pages/nfl/NflGamePage';
import { buildGamePreview } from '../lib/nflGame';
import type { NflGame } from '../lib/nflApi';
import { THEMES } from '../lib/journey';
import { LAYOUT_PAIRS } from '../lib/layoutPairs';

vi.mock('../lib/nflProjections', async () => {
  const actual = await vi.importActual<typeof proj>('../lib/nflProjections');
  return { ...actual, loadProjections: vi.fn(), loadGameProjections: vi.fn() };
});
vi.mock('../lib/commercialLinks', async () => {
  const actual = await vi.importActual<typeof import('../lib/commercialLinks')>('../lib/commercialLinks');
  return { ...actual, getActivePartners: vi.fn().mockResolvedValue([]) };
});
const mocked = proj as unknown as Record<string, ReturnType<typeof vi.fn>>;

const row = (over: Partial<proj.NflProjection>): proj.NflProjection => ({
  game_id: '2026_05_MIA_NE', season: 2026, week: 5, kickoff_at: '2026-10-11T17:00:00Z', player_id: 'p', player_slug: 'p', player_name: 'P', position: 'WR',
  team: 'NE', team_slug: 'new-england-patriots', team_short: 'Patriots', team_name: 'New England Patriots',
  opponent: 'MIA', opponent_slug: 'miami-dolphins', opponent_short: 'Dolphins', at_home: true,
  method: 'np1', proj_ppr: 10, proj_half: 8, proj_std: 6, low_ppr: 4, high_ppr: 16, base_ppr: 9, season_avg_ppr: 9.5,
  team_implied: 26, team_usual: 22, opp_factor: 1.12, games_used: 20, injury_status: null, injury: null, practice_status: null,
  computed_at: '2026-10-07T06:30:00Z', ...over,
});

const ROWS = [
  row({ player_id: 'a', player_slug: 'drake-maye', player_name: 'Drake Maye', position: 'QB', proj_ppr: 21.4, proj_half: 21.4, proj_std: 21.4, low_ppr: 12.8, high_ppr: 30.0, base_ppr: 19.5 }),
  row({ player_id: 'b', player_slug: 'tyreek-hill', player_name: 'Tyreek Hill', team: 'MIA', team_slug: 'miami-dolphins', team_short: 'Dolphins', team_name: 'Miami Dolphins', opponent: 'NE', opponent_slug: 'new-england-patriots', opponent_short: 'Patriots', at_home: false, proj_ppr: 15.2, proj_half: 12.9, proj_std: 10.6, opp_factor: 0.9 }),
  row({ player_id: 'c', player_slug: 'rhamondre-stevenson', player_name: 'Rhamondre Stevenson', position: 'RB', method: 'season_avg', proj_ppr: 13.0, proj_half: 11.5, proj_std: 10.0 }),
  row({ player_id: 'd', player_slug: 'hunter-henry', player_name: 'Hunter Henry', position: 'TE', proj_ppr: 9.0, injury_status: 'Out', injury: 'Knee' }),
];

describe('NFL projection helpers', () => {
  it('scales the range to the format and labels the matchup and team points', () => {
    const r = row({ proj_ppr: 10, proj_half: 8, low_ppr: 4, high_ppr: 16 });
    expect(proj.rangeOf(r, 'ppr')).toEqual([4, 16]);
    expect(proj.rangeOf(r, 'half')).toEqual([3.2, 12.8]);
    expect(proj.matchupLabel(row({ opp_factor: 1.12 }))).toBe('+12%');
    expect(proj.matchupLabel(row({ opp_factor: 0.9 }))).toBe('−10%');
    expect(proj.matchupLabel(row({ opp_factor: null }))).toBe('–');
    expect(proj.teamPointsLabel(row({}))).toBe('26.0 (usual 22.0)');
    expect(proj.isUnlikely(row({ injury_status: 'Doubtful' }))).toBe(true);
    expect(proj.isUnlikely(row({ injury_status: 'Questionable' }))).toBe(false);
  });

  it('explains a projection in one sentence', () => {
    expect(proj.projectionSentence(row({ player_name: 'Stefon Diggs' }), 'ppr')).toBe(
      'Stefon Diggs: 10.0 points from a recent 9.0 a game, with the Patriots expected to score 26, more than their usual 22 and the Dolphins give up 12% more than average to WRs.'
    );
    expect(proj.projectionSentence(row({ player_name: 'Rhamondre Stevenson', position: 'RB', method: 'season_avg', proj_ppr: 13 }), 'ppr')).toContain('his season average so far (for running backs');
  });

  it('only shows the projector where it passed its test', () => {
    expect(proj.NP1_RESULT.filter((x) => x.passed).map((x) => x.pos)).toEqual(['QB', 'WR', 'TE']);
  });
});

describe('NFL Match Projections page', () => {
  it('ranks players, hides those ruled out, and filters by club, position and format', async () => {
    mocked.loadProjections.mockResolvedValue(ROWS);
    render(<MemoryRouter initialEntries={['/nfl/projections']}><Routes><Route path="/nfl/projections" element={<NflProjectionsPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId('nfl-proj-row')).toHaveLength(3));
    expect(screen.getAllByTestId('nfl-proj-row')[0].textContent).toContain('Drake Maye');
    expect(screen.getByTestId('nfl-proj-summary').textContent).toMatch(/^3 players, week 5, PPR scoring\. Drake Maye: 21\.4 points/);
    expect(screen.getByTestId('nfl-proj-method').textContent).toContain('Season average*');
    // Season-average rows are marked.
    expect(screen.getAllByTestId('nfl-proj-row')[2].textContent).toContain('13.0*');
    // Ruled out: hidden until asked for, then shown with the status.
    fireEvent.click(screen.getByTestId('nfl-proj-show-out'));
    expect(screen.getAllByTestId('nfl-proj-row')).toHaveLength(4);
    expect(screen.getByTestId('nfl-proj-status').textContent).toBe('Out');
    // Club.
    fireEvent.change(screen.getByTestId('nfl-proj-club'), { target: { value: 'miami-dolphins' } });
    expect(screen.getAllByTestId('nfl-proj-row')).toHaveLength(1);
    expect(screen.getByTestId('nfl-proj-summary').textContent).toContain('1 Miami Dolphins players');
    fireEvent.change(screen.getByTestId('nfl-proj-club'), { target: { value: '' } });
    // Format re-ranks: half-PPR.
    fireEvent.click(screen.getByRole('button', { name: 'Half-PPR' }));
    expect(screen.getAllByTestId('nfl-proj-row')[1].textContent).toContain('12.9');
    // Position.
    fireEvent.click(screen.getByRole('button', { name: 'QB' }));
    expect(screen.getAllByTestId('nfl-proj-row')).toHaveLength(1);
  });

  it('says when there are no projections yet', async () => {
    mocked.loadProjections.mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/nfl/projections']}><Routes><Route path="/nfl/projections" element={<NflProjectionsPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('nfl-proj-empty')).toBeInTheDocument());
  });

  it('is in the NFL Fantasy menu, named as in FPL, with a layout pair', () => {
    const fantasy = THEMES.nfl.stages.find((s) => s.key === 'fantasy')!;
    expect(fantasy.links[0]).toMatchObject({ label: 'Match Projections', to: '/nfl/projections' });
    expect(THEMES.fpl.stages.flatMap((s) => s.links).some((l) => l.label === 'Match Projections')).toBe(true);
    expect(LAYOUT_PAIRS.find((p) => p.nflPath === '/nfl/projections')?.nflFile).toBe('src/pages/nfl/NflProjectionsPage.tsx');
  });
});

describe('NFL game page: projections in the team tabs', () => {
  const g = (over: Partial<NflGame>): NflGame => ({
    game_id: '2026_05_MIA_NE', season: 2026, game_type: 'REG', week: 5, gameday: '2026-10-11', kickoff_at: '2026-10-11T17:00:00Z',
    home_franchise: 'NE', home_slug: 'new-england-patriots', home_name: 'New England Patriots', home_short: 'Patriots',
    away_franchise: 'MIA', away_slug: 'miami-dolphins', away_name: 'Miami Dolphins', away_short: 'Dolphins',
    home_score: null, away_score: null, overtime: null, neutral_site: false, div_game: true,
    spread_line: 3, total_line: 44, home_moneyline: null, away_moneyline: null, roof: null, surface: null, stadium: null,
    away_qb_name: null, home_qb_name: null, home_coach: null, away_coach: null, temp: null, wind: null,
    ...over,
  } as NflGame);

  it('shows each team its own players, PPR, with a link to the full page', async () => {
    mocked.loadGameProjections.mockResolvedValue(ROWS);
    const target = g({});
    render(
      <MemoryRouter initialEntries={['/nfl/games/2026_05_MIA_NE']}>
        <Routes><Route path="/nfl/games/:gameId" element={<NflGamePage initialData={buildGamePreview(target, [target], null)} />} /></Routes>
      </MemoryRouter>
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Home Team' }));
    const home = screen.getByTestId('nfl-game-proj-home');
    expect(home.textContent).toContain('Drake Maye');
    expect(home.textContent).not.toContain('Tyreek Hill');
    expect(home.querySelector('a[href="/nfl/projections?team=new-england-patriots"]')).not.toBeNull();
    expect(screen.getByTestId('nfl-game-proj-away').textContent).toContain('Tyreek Hill');
  });
});
