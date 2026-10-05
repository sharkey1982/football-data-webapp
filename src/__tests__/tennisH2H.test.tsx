// Tennis head to head and the match model.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/tennisApi';
import { h2hSentence, h2hSummary } from '../lib/tennisH2H';
import { predict, sideFor, type RatingRow } from '../lib/tennisModel';
import type { TennisMatch, TennisPlayer } from '../lib/tennisStats';
import TennisH2HPage from '../pages/tennis/TennisH2HPage';
import { renderTennisH2HPage } from '../entry-server';

vi.mock('../lib/tennisApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/tennisApi');
  return { ...actual, loadTennisH2H: vi.fn(), loadTennisPlayers: vi.fn().mockResolvedValue({ tour: 'ATP', players: [] }) };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

let n = 0;
function m(w: 1 | 2, over: Partial<TennisMatch> = {}): TennisMatch {
  n++;
  const [wid, lid] = w === 1 ? [1, 2] : [2, 1];
  return {
    source_key: `k${n}`, tour: 'ATP', year: 2025, match_date: `2025-0${Math.min(9, n)}-01`, tournament: 'Open', tournament_slug: 'open', location: 'X',
    surface_group: 'Hard', level: '1000', level_rank: 3, round: 'Semifinals', round_order: 6, best_of: 3,
    winner: `P${wid}`, winner_slug: `p${wid}`, winner_id: wid, loser: `P${lid}`, loser_slug: `p${lid}`, loser_id: lid, w_rank: wid, l_rank: lid,
    w_games: [6, 6], l_games: [4, 4], result: 'Completed', played: true, avg_w: 1.5, avg_l: 2.6, b365_w: null, b365_l: null, ps_w: null, ps_l: null, ...over,
  };
}
const meetings = [
  m(1), m(2, { surface_group: 'Clay' }), m(2, { surface_group: 'Clay', round: 'The Final', round_order: 7 }),
  m(1, { result: 'Walkover', played: false, w_games: [], l_games: [] }), m(2, { level: 'Grand Slam', level_rank: 1, best_of: 5 }),
];
const rows = (id: number, all: number, hard: number, clay: number, rank: number): RatingRow[] => [
  { player_id: id, surface: 'All', rating: all, matches: 300, latest_rank: rank, last_match: '2026-09-01' },
  { player_id: id, surface: 'Hard', rating: hard, matches: 180, latest_rank: rank, last_match: '2026-09-01' },
  { player_id: id, surface: 'Clay', rating: clay, matches: 90, latest_rank: rank, last_match: '2026-09-01' },
];

describe('head to head', () => {
  it('counts played meetings by surface and level, finals and the current run; walkovers aside', () => {
    const s = h2hSummary(meetings, 1, 2);
    expect([s.a, s.b, s.walkovers]).toEqual([1, 3, 1]);
    expect(s.bySurface).toEqual([{ key: 'Hard', a: 1, b: 1 }, { key: 'Clay', a: 0, b: 2 }]);
    expect(s.finals).toEqual({ a: 0, b: 1 });
    expect(s.streak).toEqual({ who: 'b', n: 3 });
    expect(h2hSentence('P1', 'P2', s)).toBe('P2 leads P1 3–1 in 4 tour-level meetings; P2 has won the last 3.');
  });
});

describe('match model', () => {
  const A = rows(1, 2300, 2280, 2100, 1);
  const B = rows(2, 2250, 2150, 2250, 2);
  it('is symmetric and turns on the surface', () => {
    const a = sideFor(A, 'Hard')!;
    const b = sideFor(B, 'Hard')!;
    const p = predict(a, b, 3, 0, 0).pA;
    expect(p + predict(b, a, 3, 0, 0).pA).toBeCloseTo(1, 10);
    expect(p).toBeGreaterThan(0.6);
    const clay = predict(sideFor(A, 'Clay')!, sideFor(B, 'Clay')!, 3, 0, 0).pA;
    expect(clay).toBeLessThan(0.5); // B is the better clay-courter
  });
  it('best of five stretches the surface gap; previous meetings nudge', () => {
    const a = sideFor(A, 'Hard')!;
    const b = sideFor(B, 'Hard')!;
    expect(predict(a, b, 5, 0, 0).pA).toBeGreaterThan(predict(a, b, 3, 0, 0).pA);
    expect(predict(a, b, 3, 0, 6).pA).toBeLessThan(predict(a, b, 3, 0, 0).pA);
  });
  it('a surface never played uses the overall rating', () => {
    expect(sideFor(A, 'Grass')).toMatchObject({ surfaceElo: 2300, surfaceMatches: 0 });
  });
});

const player = (id: number): TennisPlayer => ({ player_id: id, tour: 'ATP', name: `P${id}`, slug: `p${id}`, won: 1, lost: 1, titles: 0, finals: 0, first_year: 2020, last_year: 2026, last_match: '2026-09-01', recent_matches: 100 });
const data = { tour: 'ATP' as const, a: player(1), b: player(2), ratingsA: rows(1, 2300, 2280, 2100, 1), ratingsB: rows(2, 2250, 2150, 2250, 2), meetings, modelP: { k1: 0.62, k2: 0.41 } };

describe('head-to-head page', () => {
  it('shows the record, the chance on the chosen surface and every meeting', async () => {
    mocked.loadTennisH2H.mockResolvedValue(data);
    render(<MemoryRouter initialEntries={['/tennis/head-to-head?a=p1&b=p2']}><Routes><Route path="/tennis/head-to-head" element={<TennisH2HPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByTestId('tennis-h2h-story')).toHaveTextContent('P2 leads P1 3–1');
    const chanceHard = screen.getByTestId('tennis-h2h-chance').textContent;
    fireEvent.change(screen.getByTestId('tennis-h2h-surface'), { target: { value: 'Clay' } });
    expect(screen.getByTestId('tennis-h2h-chance').textContent).not.toBe(chanceHard);
    expect(within(screen.getByTestId('tennis-h2h-meetings')).getAllByRole('row').length).toBe(1 + 5);
    expect(screen.getByTestId('tennis-h2h-model-note')).toHaveTextContent('64.8%');
  });
  it('server render', () => {
    const page = renderTennisH2HPage(data);
    expect(page.canonical).toMatch(/\/tennis\/head-to-head$/);
    expect(page.description).toContain('P2 leads P1 3–1');
  });
});
