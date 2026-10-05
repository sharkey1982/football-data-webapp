import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  chancesFromOdds,
  homeChanceFromSpread,
  nflTeamChance,
  pointsVsExpected,
  resultFlag,
  vsExpectedText,
  winsVsExpected,
} from '../lib/expectation';
import { teamChances } from '../lib/teamPageApi';
import TeamPage, { type TeamPageData } from '../pages/football/TeamPage';
import { renderTeamPage } from '../entry-server';

vi.mock('../lib/financeApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/financeApi')>('../lib/financeApi');
  return { ...actual, teamHasFinance: vi.fn().mockResolvedValue(false) };
});
vi.mock('../components/TeamHistoryPanel', () => ({ default: () => null }));

describe('results v expectation', () => {
  it('turns odds into chances with the margin removed, from either side', () => {
    const c = chancesFromOdds(2.0, 3.5, 4.0)!;
    expect(c.win + c.draw + c.lose).toBeCloseTo(1, 10);
    expect(c.win).toBeCloseTo(0.5 / (0.5 + 1 / 3.5 + 0.25), 10);
    expect(chancesFromOdds(1, 3, 3)).toBeNull();
    const odds = { match_id: 1, price_home: '2.0', price_draw: '3.5', price_away: '4.0' };
    expect(teamChances(odds, true).win_chance).toBeCloseTo(c.win, 10);
    expect(teamChances(odds, false).win_chance).toBeCloseTo(c.lose, 10);
    expect(teamChances(undefined, true)).toEqual({ win_chance: null, draw_chance: null });
  });

  it('NFL: a pick-em is 50%, a 3-point home favourite about 59%, and sides add to 1', () => {
    expect(homeChanceFromSpread(0)).toBeCloseTo(0.5, 6);
    const p3 = homeChanceFromSpread(3);
    expect(p3).toBeGreaterThan(0.55);
    expect(p3).toBeLessThan(0.63);
    expect(homeChanceFromSpread(-3)).toBeCloseTo(1 - p3, 6);
    const g = { spread_line: 3, home_franchise: 'GB' };
    expect(nflTeamChance(g, 'GB')! + nflTeamChance(g, 'CHI')!).toBeCloseTo(1, 10);
    expect(nflTeamChance({ spread_line: null, home_franchise: 'GB' }, 'GB')).toBeNull();
  });

  it('flags: upset under a third, shock over two thirds, draws never', () => {
    expect(resultFlag(0.3, 'W')).toBe('upset');
    expect(resultFlag(0.34, 'W')).toBeNull();
    expect(resultFlag(0.7, 'L')).toBe('shock');
    expect(resultFlag(0.6, 'L')).toBeNull();
    expect(resultFlag(0.8, 'D')).toBeNull();
    expect(resultFlag(null, 'W')).toBeNull();
  });

  it('season totals and the sentence', () => {
    const s = pointsVsExpected([
      { outcome: 'W', win: 0.25, draw: 0.25 },
      { outcome: 'L', win: 0.75, draw: 0.15 },
      { outcome: 'D', win: 0.4, draw: 0.3 },
      { outcome: null, win: 0.5, draw: 0.25 },
    ]);
    expect(s).toMatchObject({ played: 3, actual: 4, upsets: 1, shocks: 1 });
    expect(s.expected).toBeCloseTo(3 * 0.25 + 0.25 + 3 * 0.75 + 0.15 + 3 * 0.4 + 0.3, 10);
    expect(vsExpectedText(s, 'points')).toBe('4 points v 4.9 expected (−0.9) · 1 upset, 1 shock');
    expect(vsExpectedText(winsVsExpected([{ outcome: 'W', win: 0.5 }, { outcome: 'D', win: 0.5 }]), 'wins')).toBe('1.5 wins v 1.0 expected (+0.5)');
  });

  const data: TeamPageData = {
    profile: { team_id: 70, slug: 'southend', display_name: 'Southend', league_name: 'National League', league_id: 5, goals_for_per_game: null, goals_against_per_game: null, is_estimated: false, fitted_at: null },
    matches: [
      { slug: null, kickoff_date: '2026-08-08', opponent_name: 'York', is_home: true, status: 'played', goals_for: 2, goals_against: 0, predicted_goals_for: null, predicted_goals_against: null, win_chance: 0.28, draw_chance: 0.27 },
      { slug: null, kickoff_date: '2026-08-15', opponent_name: 'Tamworth', is_home: false, status: 'played', goals_for: 0, goals_against: 1, predicted_goals_for: null, predicted_goals_against: null, win_chance: 0.7, draw_chance: 0.2 },
    ],
    hasFinance: false,
  } as TeamPageData;

  it('football team page: win chance column, flags and points v expected', () => {
    render(
      <MemoryRouter initialEntries={['/football/teams/southend']}>
        <Routes><Route path="/football/teams/:slug" element={<TeamPage initialData={data} />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('team-vs-expected').textContent).toBe('3 points v 3.4 expected (−0.4) · 1 upset, 1 shock');
    expect(screen.getByTestId('result-flag-upset')).toBeInTheDocument();
    expect(screen.getByTestId('result-flag-shock')).toBeInTheDocument();
    expect(screen.getByText('28%')).toBeInTheDocument();
    expect(renderTeamPage('southend', data).html).toContain('Upset');
  });
});
