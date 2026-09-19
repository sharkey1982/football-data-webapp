import { describe, it, expect } from 'vitest';
import { buildModelFromLambdas, derivedMarkets } from '../lib/matchPageApi';

describe('derivedMarkets', () => {
  it('normalises so over and under sum to 100', () => {
    // The score grid is truncated at a maximum scoreline, so raw
    // probabilities sum to slightly under 1. Unnormalised, a page would
    // show "over 54%, under 45%" and read as a bug.
    const m = derivedMarkets(buildModelFromLambdas(1.6, 1.2, -0.12));
    expect(m.overTwoFive + m.underTwoFive).toBeCloseTo(100, 6);
  });

  it('puts a high-scoring fixture above a low-scoring one', () => {
    const high = derivedMarkets(buildModelFromLambdas(2.4, 2.0, -0.12));
    const low = derivedMarkets(buildModelFromLambdas(0.9, 0.7, -0.12));
    expect(high.overTwoFive).toBeGreaterThan(low.overTwoFive);
    expect(high.bothScore).toBeGreaterThan(low.bothScore);
  });

  it('makes a clean sheet likelier against a weak attack', () => {
    // Away side expected to score very little -> home clean sheet high.
    const m = derivedMarkets(buildModelFromLambdas(2.0, 0.3, -0.12));
    expect(m.homeCleanSheet).toBeGreaterThan(m.awayCleanSheet);
    expect(m.homeCleanSheet).toBeGreaterThan(50);
  });

  it('keeps every market within 0-100', () => {
    for (const [h, a] of [[0.4, 0.3], [3.5, 3.1], [1.0, 1.0]]) {
      const m = derivedMarkets(buildModelFromLambdas(h, a, -0.12));
      for (const v of Object.values(m)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
