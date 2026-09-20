import { describe, it, expect } from 'vitest';
import { calculateDixonColesFromExpectedGoals } from '../lib/dixonColes';
import { derivedMarkets } from '../lib/matchPageApi';

// Match Preview's Prediction tab now shows six outcome numbers above the
// score grid, and claims they come from that same grid. These pin the
// claim: the 1X2 split and the over/BTTS markets must be derivable from
// one model object, and must agree with the SQL that scores them on the
// accuracy page.
describe('match preview prediction markets', () => {
  it('derives 1X2 and over/BTTS from a single model, all summing correctly', () => {
    const dc = calculateDixonColesFromExpectedGoals(1.67, 1.5, 0.0326);
    const m = derivedMarkets(dc);

    expect(dc.homeWinPct + dc.drawPct + dc.awayWinPct).toBeCloseTo(100, 6);
    expect(m.overTwoFive + m.underTwoFive).toBeCloseTo(100, 6);
    // A near-even fixture should not produce a lopsided 1X2.
    expect(Math.abs(dc.homeWinPct - dc.awayWinPct)).toBeLessThan(12);
  });

  it('matches the figures the SQL scorer produces for the same inputs', () => {
    // public.fixture_derived_markets(1.8, 1.1, -0.05) returns these.
    // If the two ever drift, Match Preview would show one thing and the
    // accuracy page would score another.
    const dc = calculateDixonColesFromExpectedGoals(1.8, 1.1, -0.05);
    const m = derivedMarkets(dc);
    expect(dc.homeWinPct).toBeCloseTo(53.21, 1);
    expect(dc.drawPct).toBeCloseTo(24.23, 1);
    expect(dc.awayWinPct).toBeCloseTo(22.56, 1);
    expect(m.overTwoFive).toBeCloseTo(55.4, 1);
    expect(m.bothScore).toBeCloseTo(56.23, 1);
  });
});
