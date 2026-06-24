// ============================================================================
// src/lib/dixonColes.ts
//
// Client-side Dixon-Coles probability calculation. This does NOT fit the
// model -- that's the expensive part, done by the Python script
// (scripts/fit_dixon_coles.py in the importer project) and stored in
// model_fit_runs / team_ratings. This module takes already-fitted
// parameters and computes the probability grid, which is cheap arithmetic
// safe to run live in the browser on every prediction request.
//
// IMPORTANT: the formulas here must stay in sync with fit_dixon_coles.py.
// If you change one, change the other, or predictions will silently stop
// matching what the model was actually fitted to.
// ============================================================================

import type { ModelFitRun, TeamRating } from '../types/database';

/** Poisson PMF: P(X = k) for a Poisson distribution with mean lambda. */
function poissonPmf(k: number, lambda: number): number {
  // log-space computation to avoid overflow/underflow for larger lambda/k,
  // then exponentiate at the end.
  let logPmf = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) {
    logPmf -= Math.log(i);
  }
  return Math.exp(logPmf);
}

/**
 * The Dixon-Coles low-score correction tau(x, y).
 * Matches fit_dixon_coles.py's dixon_coles_tau exactly:
 *   tau(0,0) = 1 - lambda_home*lambda_away*rho
 *   tau(0,1) = 1 + lambda_home*rho
 *   tau(1,0) = 1 + lambda_away*rho
 *   tau(1,1) = 1 - rho
 *   tau(x,y) = 1 otherwise
 */
function dixonColesTau(x: number, y: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

export interface DixonColesInputs {
  homeAttack: number;
  homeDefence: number;
  awayAttack: number;
  awayDefence: number;
  rho: number;
  homeAdvantage: number;
}

export interface DixonColesResult {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  /** scoreGrid[h][a] = probability of an h-a final score, for h,a in 0..maxGoals */
  scoreGrid: number[][];
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  maxGoals: number;
}

/**
 * Computes the full Dixon-Coles probability grid for a fixture, given
 * fitted attack/defence parameters for both teams and the shared rho/home
 * advantage from the same fit run.
 *
 * Matches fit_dixon_coles.py's expected-goals formula exactly:
 *   lambda_home = exp(home_advantage + attack_home - defence_away)
 *   lambda_away = exp(attack_away - defence_home)
 */
export function calculateDixonColes(inputs: DixonColesInputs, maxGoals = 8): DixonColesResult {
  const { homeAttack, homeDefence, awayAttack, awayDefence, rho, homeAdvantage } = inputs;

  const expectedHomeGoals = Math.exp(homeAdvantage + homeAttack - awayDefence);
  const expectedAwayGoals = Math.exp(awayAttack - homeDefence);

  const scoreGrid: number[][] = [];
  let homeWinPct = 0;
  let drawPct = 0;
  let awayWinPct = 0;

  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const tau = dixonColesTau(h, a, expectedHomeGoals, expectedAwayGoals, rho);
      const prob = tau * poissonPmf(h, expectedHomeGoals) * poissonPmf(a, expectedAwayGoals);
      row.push(prob);

      if (h > a) homeWinPct += prob;
      else if (h === a) drawPct += prob;
      else awayWinPct += prob;
    }
    scoreGrid.push(row);
  }

  // The grid is truncated at maxGoals, so probabilities won't sum to
  // exactly 100% (a tiny residual mass sits beyond the grid for very
  // high-scoring outcomes). Renormalise so the three outcome percentages
  // sum cleanly to 100, which is what the UI actually displays.
  const total = homeWinPct + drawPct + awayWinPct;

  return {
    expectedHomeGoals,
    expectedAwayGoals,
    scoreGrid,
    homeWinPct: (homeWinPct / total) * 100,
    drawPct: (drawPct / total) * 100,
    awayWinPct: (awayWinPct / total) * 100,
    maxGoals,
  };
}

export type { ModelFitRun, TeamRating };

/**
 * Averages individual Dixon-Coles predictions across multiple opponents --
 * used for "team vs category" comparisons (e.g. "Arsenal vs the Big Six"),
 * where there's no single opposing team to fit goals against. This is a
 * genuine average of real per-fixture calculations, not a fabricated
 * single number: each opponent's prediction is computed exactly as if it
 * were a real one-off fixture, then the win/draw/loss percentages and
 * expected goals are averaged across all of them.
 *
 * isHomeTeam controls whether `team` plays home or away in EVERY simulated
 * fixture against the category -- a real category comparison would mix
 * home and away fixtures across a season, but averaging a single
 * orientation keeps the maths simple and the result easy to explain; the
 * UI should be explicit about which orientation was used.
 */
export function calculateDixonColesVsCategory(
  team: { attackStrength: number; defenceStrength: number },
  opponents: Array<{ attackStrength: number; defenceStrength: number }>,
  fitRun: { rho: number; homeAdvantage: number },
  isHomeTeam: boolean
): {
  averaged: { homeWinPct: number; drawPct: number; awayWinPct: number; expectedHomeGoals: number; expectedAwayGoals: number };
  perOpponent: DixonColesResult[];
} {
  const perOpponent = opponents.map((opp) =>
    isHomeTeam
      ? calculateDixonColes({
          homeAttack: team.attackStrength,
          homeDefence: team.defenceStrength,
          awayAttack: opp.attackStrength,
          awayDefence: opp.defenceStrength,
          rho: fitRun.rho,
          homeAdvantage: fitRun.homeAdvantage,
        })
      : calculateDixonColes({
          homeAttack: opp.attackStrength,
          homeDefence: opp.defenceStrength,
          awayAttack: team.attackStrength,
          awayDefence: team.defenceStrength,
          rho: fitRun.rho,
          homeAdvantage: fitRun.homeAdvantage,
        })
  );

  const n = perOpponent.length;
  const sum = (fn: (r: DixonColesResult) => number) => perOpponent.reduce((acc, r) => acc + fn(r), 0) / n;

  // When isHomeTeam is false, "team" is the away side -- its win% is
  // awayWinPct on each individual calculation, not homeWinPct. Average the
  // correct field for "team" and "opponent" regardless of orientation.
  const teamWinPct = isHomeTeam ? sum((r) => r.homeWinPct) : sum((r) => r.awayWinPct);
  const opponentWinPct = isHomeTeam ? sum((r) => r.awayWinPct) : sum((r) => r.homeWinPct);
  const teamExpectedGoals = isHomeTeam ? sum((r) => r.expectedHomeGoals) : sum((r) => r.expectedAwayGoals);
  const opponentExpectedGoals = isHomeTeam ? sum((r) => r.expectedAwayGoals) : sum((r) => r.expectedHomeGoals);

  return {
    averaged: {
      homeWinPct: isHomeTeam ? teamWinPct : opponentWinPct,
      drawPct: sum((r) => r.drawPct),
      awayWinPct: isHomeTeam ? opponentWinPct : teamWinPct,
      expectedHomeGoals: isHomeTeam ? teamExpectedGoals : opponentExpectedGoals,
      expectedAwayGoals: isHomeTeam ? opponentExpectedGoals : teamExpectedGoals,
    },
    perOpponent,
  };
}
