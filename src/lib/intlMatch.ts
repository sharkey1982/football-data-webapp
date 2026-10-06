// ============================================================================
// src/lib/intlMatch.ts
//
// International match pages (/international/matches/:slug): the page address
// for a game or fixture, and model IP1's scoreline grid worked out in the
// browser from the two sides' Elo ratings (the same formula as
// scripts/intl_projections.py), so a played game can show what the model
// expected beforehand and any fixture can show a prediction.
// ============================================================================

export const INTL_MATCHES_PATH = '/international/matches';

/** "2026-11-14-england-v-spain": date (UK) and both slugs. */
export const intlMatchSlug = (date: string, homeSlug: string, awaySlug: string) => `${date}-${homeSlug}-v-${awaySlug}`;
export const intlMatchPath = (date: string, homeSlug: string, awaySlug: string) => `${INTL_MATCHES_PATH}/${intlMatchSlug(date, homeSlug, awaySlug)}`;

export function parseIntlMatchSlug(slug: string): { date: string; home: string; away: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})-(.+)-v-(.+)$/.exec(slug);
  return m ? { date: m[1], home: m[2], away: m[3] } : null;
}

const KINDS = ['friendly', 'qualifying', 'nations_league', 'tournament'] as const;
const MAXG = 10;

function poisson(k: number, l: number): number {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

/** Scoreline probabilities grid[h][a] from IP1 parameters
 * [mu, home, b, k_qualifying, k_nations_league, k_tournament, rho, e]. */
export function ip1Grid(params: number[], eloHome: number, eloAway: number, neutral: boolean, kind: string): number[][] {
  const [mu, g, b, k1, k2, k3, rho, e] = params;
  const d = (eloHome - eloAway) / 400;
  const k = kind === KINDS[1] ? k1 : kind === KINDS[2] ? k2 : kind === KINDS[3] ? k3 : 0;
  const base = mu + k + e * Math.abs(d);
  const lh = Math.exp(base + (neutral ? 0 : g) + b * d);
  const la = Math.exp(base - b * d);
  const grid: number[][] = [];
  let total = 0;
  for (let h = 0; h <= MAXG; h++) {
    grid.push([]);
    for (let a = 0; a <= MAXG; a++) {
      let tau = 1;
      if (h === 0 && a === 0) tau = 1 - lh * la * rho;
      else if (h === 0 && a === 1) tau = 1 + lh * rho;
      else if (h === 1 && a === 0) tau = 1 + la * rho;
      else if (h === 1 && a === 1) tau = 1 - rho;
      const p = poisson(h, lh) * poisson(a, la) * tau;
      grid[h].push(p);
      total += p;
    }
  }
  return grid.map((row) => row.map((p) => p / total));
}

export type GridSummary = { pHome: number; pDraw: number; pAway: number; xgHome: number; xgAway: number; top: { h: number; a: number; p: number }[] };

export function summariseGrid(grid: number[][]): GridSummary {
  let pHome = 0, pDraw = 0, pAway = 0, xgHome = 0, xgAway = 0;
  const all: { h: number; a: number; p: number }[] = [];
  grid.forEach((row, h) =>
    row.forEach((p, a) => {
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
      xgHome += h * p;
      xgAway += a * p;
      all.push({ h, a, p });
    })
  );
  all.sort((x, y) => y.p - x.p);
  return { pHome, pDraw, pAway, xgHome, xgAway, top: all.slice(0, 6) };
}

/** Competition kind of a fixture-feed edition (only the Nations League feeds fixtures). */
export const kindOfEdition = (editionKey: string | null) => (editionKey?.startsWith('UNL-') ? 'nations_league' : 'friendly');
