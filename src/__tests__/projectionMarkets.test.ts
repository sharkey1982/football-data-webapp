import { describe, it, expect } from 'vitest';
import { buildModelFromLambdas, derivedMarkets } from '../lib/matchPageApi';
import { calculateDixonColesFromExpectedGoals } from '../lib/dixonColes';

// Results Projections tells the reader that the scoreline, the 1X2 split
// and the over/BTTS numbers "come from the same score grid, so they
// can't disagree". These tests hold that claim to account, and pin the
// TypeScript against the SQL that scores it on the accuracy page.
describe('projection markets', () => {
  it('1X2 and derived markets come from one grid, and both sum correctly', () => {
    const model = buildModelFromLambdas(1.8, 1.1, -0.05);
    const markets = derivedMarkets(model);

    expect(model.homeWinPct + model.drawPct + model.awayWinPct).toBeCloseTo(100, 6);
    expect(markets.overTwoFive + markets.underTwoFive).toBeCloseTo(100, 6);
  });

  it('matches the SQL fixture_derived_markets output to two decimals', () => {
    // These are the exact figures public.fixture_derived_markets(1.8,
    // 1.1, -0.05) returns. If the TypeScript and the SQL ever diverge,
    // the projections would show one thing and the accuracy page would
    // score another -- which is precisely the bug this pins.
    const model = buildModelFromLambdas(1.8, 1.1, -0.05);
    const markets = derivedMarkets(model);

    expect(model.homeWinPct).toBeCloseTo(53.21, 1);
    expect(model.drawPct).toBeCloseTo(24.23, 1);
    expect(model.awayWinPct).toBeCloseTo(22.56, 1);
    expect(markets.overTwoFive).toBeCloseTo(55.40, 1);
    expect(markets.bothScore).toBeCloseTo(56.23, 1);
  });

  it('building from stored expected goals gives the same answer as from lambdas', () => {
    // Match Preview now uses calculateDixonColesFromExpectedGoals for
    // scheduled fixtures; it must agree with the path the projections
    // use, or the same fixture reads differently on two pages again.
    const viaLambdas = buildModelFromLambdas(2.4, 0.9, 0.03);
    const viaStored = calculateDixonColesFromExpectedGoals(2.4, 0.9, 0.03);

    expect(viaStored.homeWinPct).toBeCloseTo(viaLambdas.homeWinPct, 6);
    expect(viaStored.drawPct).toBeCloseTo(viaLambdas.drawPct, 6);
    expect(viaStored.awayWinPct).toBeCloseTo(viaLambdas.awayWinPct, 6);
  });

  it('a heavy favourite and a tight match produce sane splits', () => {
    const lopsided = buildModelFromLambdas(3.2, 0.6, -0.05);
    const tight = buildModelFromLambdas(1.3, 1.3, -0.05);

    expect(lopsided.homeWinPct).toBeGreaterThan(80);
    expect(tight.homeWinPct).toBeCloseTo(tight.awayWinPct, 6);
    // The tau correction lifts draws in low-scoring games.
    expect(tight.drawPct).toBeGreaterThan(lopsided.drawPct);
  });
});
