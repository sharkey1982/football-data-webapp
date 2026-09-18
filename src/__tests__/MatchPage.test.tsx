import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MatchPage from '../pages/football/MatchPage';
import { mostLikelyScore } from '../lib/matchPageApi';
import { calculateDixonColes } from '../lib/dixonColes';
import * as matchApi from '../lib/matchPageApi';

vi.mock('../lib/matchPageApi', async () => {
  const actual = await vi.importActual<typeof matchApi>('../lib/matchPageApi');
  return { ...actual, getMatchBySlug: vi.fn() };
});

const mocked = matchApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/football/matches/${slug}`]}>
      <Routes>
        <Route path="/football/matches/:slug" element={<MatchPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('match prediction maths', () => {
  it('reproduces the fixture\u2019s own frozen expected goals exactly when fed log-lambdas', () => {
    // This is the load-bearing assumption in matchPageApi.getMatchBySlug:
    // calculateDixonColes derives lambdas from ratings, so feeding it
    // ln(lambda) with zeroed home advantage and defence must return the
    // original lambdas untouched. If this ever stopped holding, every
    // match page would silently show probabilities computed from
    // different expected goals than the ones it displays.
    const lambdaHome = 2.01139517231193;
    const lambdaAway = 0.42421633218266;
    const result = calculateDixonColes({
      homeAttack: Math.log(lambdaHome),
      homeDefence: 0,
      awayAttack: Math.log(lambdaAway),
      awayDefence: 0,
      rho: -0.126296876967287,
      homeAdvantage: 0,
    });
    expect(result.expectedHomeGoals).toBeCloseTo(lambdaHome, 10);
    expect(result.expectedAwayGoals).toBeCloseTo(lambdaAway, 10);
    // And the outcome probabilities should be a sane, normalised set.
    const total = result.homeWinPct + result.drawPct + result.awayWinPct;
    expect(total).toBeCloseTo(100, 6);
    expect(result.homeWinPct).toBeGreaterThan(result.awayWinPct); // heavy home favourite
  });

  it('finds the single highest-probability scoreline in the grid', () => {
    const model = calculateDixonColes({
      homeAttack: Math.log(1.6),
      homeDefence: 0,
      awayAttack: Math.log(1.1),
      awayDefence: 0,
      rho: -0.12,
      homeAdvantage: 0,
    });
    const best = mostLikelyScore(model);
    let maxSeen = -1;
    for (const row of model.scoreGrid) for (const cell of row) maxSeen = Math.max(maxSeen, cell);
    expect(best.probability).toBeCloseTo(maxSeen, 12);
  });
});

describe('MatchPage', () => {
  const base = {
    slug: 'arsenal-v-coventry-2026-08-21',
    home_team_name: 'Arsenal',
    away_team_name: 'Coventry',
    home_team_slug: 'arsenal',
    away_team_slug: 'coventry',
    kickoff_date: '2026-08-21',
    matchweek: 1,
    league_name: 'Premier League',
    predicted_home_goals: 2.01,
    predicted_away_goals: 0.42,
    predicted_at: '2026-09-11T08:23:25Z',
    fit_run_id: 2,
    model: calculateDixonColes({
      homeAttack: Math.log(2.01),
      homeDefence: 0,
      awayAttack: Math.log(0.42),
      awayDefence: 0,
      rho: -0.126,
      homeAdvantage: 0,
    }),
  };

  it('states outcome probabilities in prose and in a real table', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'scheduled', actual_home_goals: null, actual_away_goals: null });
    renderAt(base.slug);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Arsenal v Coventry' })).toBeInTheDocument());
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Arsenal win' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Draw' })).toBeInTheDocument();
    // Prose version of the same numbers, so the page answers the question
    // without needing the table parsed.
    expect(screen.getByText(/chance of\s+winning/)).toBeInTheDocument();
    expect(screen.getByText(/most likely scoreline/)).toBeInTheDocument();
  });

  it('shows the real result alongside the pre-kickoff prediction for a played match', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'played', actual_home_goals: 3, actual_away_goals: 0 });
    renderAt(base.slug);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument());
    expect(screen.getByText(/Arsenal 3\u20130 Coventry/)).toBeInTheDocument();
    // Framed in the past tense -- it's explicitly what was predicted
    // beforehand, not a recomputed hindsight number.
    expect(screen.getByRole('heading', { name: 'What the model predicted beforehand' })).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown slug', async () => {
    mocked.getMatchBySlug.mockResolvedValue(null);
    renderAt('no-such-match');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Match not found' })).toBeInTheDocument());
  });
});
