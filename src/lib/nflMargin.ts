// ============================================================================
// src/lib/nflMargin.ts
//
// The spread of likely results for one NFL game: the NFL counterpart of the
// football page's Dixon-Coles scoreline grid. Final home margin ~ a normal
// curve around the model's expected margin (Stern 1991), reweighted for the
// NFL's key numbers (3, 7, 10, 14 ...) -- shape fitted by
// scripts/nfl_margin_shape.py into nflMarginShape.ts.
// ============================================================================

import { MARGIN_SD, MARGIN_WEIGHTS } from './nflMarginShape';

const RANGE = 70;

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7).
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

const phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

/** P(final home margin = m) for m in -70..70, for an expected home margin mu. */
export function marginDistribution(mu: number): Map<number, number> {
  const raw = new Map<number, number>();
  let z = 0;
  for (let m = -RANGE; m <= RANGE; m++) {
    const p = (phi((m + 0.5 - mu) / MARGIN_SD) - phi((m - 0.5 - mu) / MARGIN_SD)) * (MARGIN_WEIGHTS[Math.abs(m)] ?? 1);
    raw.set(m, p);
    z += p;
  }
  for (const [m, p] of raw) raw.set(m, p / z);
  return raw;
}

export type MarginBucket = { key: string; side: 'home' | 'away' | 'tie'; from: number; to: number; p: number };

/** Margin bands, away's biggest wins on the left to home's on the right. */
const BANDS: [number, number][] = [
  [1, 3],
  [4, 7],
  [8, 14],
  [15, RANGE],
];

export function marginBuckets(dist: Map<number, number>): MarginBucket[] {
  const sum = (a: number, b: number) => {
    let s = 0;
    for (let m = a; m <= b; m++) s += dist.get(m) ?? 0;
    return s;
  };
  const away = [...BANDS].reverse().map(([a, b]) => ({ key: `away-${a}`, side: 'away' as const, from: a, to: b, p: sum(-b, -a) }));
  const home = BANDS.map(([a, b]) => ({ key: `home-${a}`, side: 'home' as const, from: a, to: b, p: sum(a, b) }));
  return [...away, { key: 'tie', side: 'tie', from: 0, to: 0, p: dist.get(0) ?? 0 }, ...home];
}

/** The most likely exact margins, most likely first. */
export function likeliestMargins(dist: Map<number, number>, n = 3): { margin: number; p: number }[] {
  return [...dist.entries()]
    .filter(([m]) => m !== 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([margin, p]) => ({ margin, p }));
}

/** P(the favourite wins by more than the line). nflverse spread_line is
 * positive when the home side is favoured; landing exactly on it is a push. */
export function favouriteCoverProb(dist: Map<number, number>, spreadLine: number): number {
  let p = 0;
  for (const [m, q] of dist) if (spreadLine > 0 ? m > spreadLine : m < spreadLine) p += q;
  return p;
}
