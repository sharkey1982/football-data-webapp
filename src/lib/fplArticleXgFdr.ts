// ============================================================================
// src/lib/fplArticleXgFdr.ts
//
// Figures for /fpl/articles/xg-or-fdr (9 Oct 2026). All from one run of
// scripts/analysis_xg_vs_fdr.py (Model Lab job analysis_xg_vs_fdr, run
// 37926992785; analysis_results 'xg_vs_fdr'), on every Premier League start
// 2022/23-2025/26 with FPL's own points, and point-in-time FDR rebuilt from
// the public FPL archive by scripts/analysis/build_fdr_pit.py.
//
// "Right" = of every pair of starts with different points, the share where
// the predictor put the higher scorer first (ties in the predictor count
// half). 50 = a coin flip. Percentages, one decimal; intervals are 95%
// bootstrap intervals.
// ============================================================================

export const XG_FDR = {
  starts: 29334,
  startsAll: 33495,
  seasons: '2022/23 to 2025/26',
  /** Share of these starts whose FDR had changed by the end of the season. */
  fdrRevisedShare: 24.9,
  /** Fixtures (of 380) whose FDR FPL had revised by season end. */
  fdrRevisedFixtures: [
    { season: '2022/23', n: 79, snapshots: 38 },
    { season: '2023/24', n: 113, snapshots: 38 },
    { season: '2024/25', n: 255, snapshots: 37 },
    { season: '2025/26', n: 202, snapshots: 12 },
  ],
  homeGoals: 1.506,
  awayGoals: 1.219,
  homeMatches: 3040,
  pairsBetween: 828833,
  pairsSame: 262875,
} as const;

export type Predictor = 'fdr' | 'xg' | 'mkt' | 'xgi90' | 'pts90' | 'price';
export const PREDICTOR_LABEL: Record<Predictor, string> = {
  fdr: 'FDR',
  xg: 'xG fixture rating',
  mkt: 'Market team goals',
  xgi90: 'Player xGI per 90',
  pts90: 'Player points per 90',
  price: 'FPL price',
};

/** Question 1: two starters, same gameweek and position. */
export const BETWEEN: Record<'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD', Record<Predictor, number>> = {
  ALL: { fdr: 55.6, xg: 57.5, mkt: 59.9, xgi90: 55.9, pts90: 56.1, price: 57.0 },
  GK: { fdr: 54.6, xg: 55.3, mkt: 57.0, xgi90: 51.7, pts90: 51.1, price: 52.9 },
  DEF: { fdr: 56.8, xg: 58.7, mkt: 61.6, xgi90: 52.7, pts90: 54.8, price: 55.3 },
  MID: { fdr: 54.7, xg: 56.8, mkt: 58.9, xgi90: 58.7, pts90: 57.5, price: 58.6 },
  FWD: { fdr: 54.7, xg: 56.3, mkt: 57.7, xgi90: 55.6, pts90: 54.7, price: 56.2 },
};
/** Differences from FDR (percentage points) with 95% intervals, all positions. */
export const BETWEEN_DIFF = {
  xg: { d: 1.9, lo: 1.1, hi: 2.7 },
  mkt: { d: 4.3, lo: 3.7, hi: 4.9 },
};
/** Pairs where FDR and the rating order two players oppositely: share the rating got right. */
export const BETWEEN_H2H = { xg: { right: 51.7, pairs: 141938 }, mkt: { right: 57.1, pairs: 108805 } };

/** Question 2: two starts by the same player in the same season. */
export const SAME: Record<'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD', { fdr: number; xg: number; mkt: number }> = {
  ALL: { fdr: 55.8, xg: 54.4, mkt: 57.0 },
  GK: { fdr: 54.6, xg: 52.9, mkt: 54.8 },
  DEF: { fdr: 57.0, xg: 55.5, mkt: 58.8 },
  MID: { fdr: 54.9, xg: 53.9, mkt: 56.1 },
  FWD: { fdr: 55.6, xg: 54.3, mkt: 56.2 },
};

/** Every xG rating tried on question 2 (all positions), with the difference from FDR. */
export const SAME_VARIANTS: { key: string; label: string; short: string; right: number; d: number | null; lo?: number; hi?: number; main?: boolean }[] = [
  { key: 'mkt', label: 'Market team goals', short: 'Market goals', right: 57.0, d: 1.3, lo: 1.0, hi: 1.6 },
  { key: 'opp38', label: 'xG, opponent only, 38 GWs', short: 'Opp. xG, 38 GWs', right: 55.8, d: 0.1, lo: -0.4, hi: 0.5 },
  { key: 'fdr', label: 'FDR', short: 'FDR', right: 55.8, d: null },
  { key: 'xg20', label: 'xG rating, 20 GWs', short: 'xG, 20 GWs', right: 55.3, d: -0.5, lo: -1.0, hi: -0.0 },
  { key: 'opp10', label: 'xG, opponent only, 10 GWs', short: 'Opp. xG, 10 GWs', right: 55.3, d: -0.5, lo: -1.0, hi: 0.0 },
  { key: 'xg38', label: 'xG rating, 38 GWs', short: 'xG, 38 GWs', right: 55.2, d: -0.6, lo: -1.0, hi: -0.1 },
  { key: 'xg10', label: 'xG rating, 10 GWs', short: 'xG, 10 GWs', right: 54.4, d: -1.3, lo: -1.9, hi: -0.8, main: true },
];

/** Same player, when FDR and a rating disagree on which week is easier. */
export const SAME_H2H = {
  xg: { right: 45.0, lo: 43.9, hi: 46.1, pairs: 47399 },
  mkt: { right: 51.4, lo: 50.0, hi: 52.8, pairs: 18168 },
};
/** FDR rates a third of a player's pairs of weeks the same; when it doesn't, how often it is right. */
export const FDR_TIES = { tiedShare: 32.6, strictRight: 58.5 };

export const SAME_BY_SEASON = [
  { season: '2022/23', fdr: 55.9, xg: 51.8, mkt: 57.6 },
  { season: '2023/24', fdr: 57.0, xg: 57.1, mkt: 58.8 },
  { season: '2024/25', fdr: 55.3, xg: 54.8, mkt: 56.4 },
  { season: '2025/26', fdr: 54.9, xg: 53.5, mkt: 55.6 },
];

/** End-of-season FDR (hindsight) against the FDR shown before kick-off. */
export const HINDSIGHT = { same: { live: 55.8, end: 56.6 }, between: { live: 55.6, end: 56.6 } };

/** Points per start by the FDR shown before kick-off (band 1 has under 70 starts per position, so it is merged with 2). */
export const BY_FDR: Record<'GK' | 'DEF' | 'MID' | 'FWD', { fdr: number; pts: number; n: number }[]> = {
  GK: [{ fdr: 1, pts: 4.071, n: 14 }, { fdr: 2, pts: 3.716, n: 1048 }, { fdr: 3, pts: 3.314, n: 975 }, { fdr: 4, pts: 3.098, n: 491 }, { fdr: 5, pts: 2.665, n: 182 }],
  DEF: [{ fdr: 1, pts: 4.069, n: 58 }, { fdr: 2, pts: 3.487, n: 4249 }, { fdr: 3, pts: 3.009, n: 3988 }, { fdr: 4, pts: 2.489, n: 2039 }, { fdr: 5, pts: 1.846, n: 749 }],
  MID: [{ fdr: 1, pts: 3.919, n: 62 }, { fdr: 2, pts: 3.878, n: 4949 }, { fdr: 3, pts: 3.55, n: 4593 }, { fdr: 4, pts: 3.204, n: 2286 }, { fdr: 5, pts: 2.671, n: 846 }],
  FWD: [{ fdr: 1, pts: 5.571, n: 14 }, { fdr: 2, pts: 4.603, n: 1125 }, { fdr: 3, pts: 4.318, n: 994 }, { fdr: 4, pts: 3.35, n: 500 }, { fdr: 5, pts: 3.436, n: 172 }],
};

/** Points per start in the easiest and hardest fifth of starts by market team goals (own for MID/FWD, opponent's for GK/DEF). */
export const MARKET_FIFTHS: Record<'GK' | 'DEF' | 'MID' | 'FWD', { easiest: number; hardest: number }> = {
  GK: { easiest: 3.992, hardest: 2.649 },
  DEF: { easiest: 4.206, hardest: 1.764 },
  MID: { easiest: 4.562, hardest: 2.732 },
  FWD: { easiest: 5.492, hardest: 3.246 },
};

/** Average 10-GW xG attack rating (expected team goals) by FDR, midfielders' starts: the two mostly agree. */
export const XG_BY_FDR_MID = [
  { fdr: 1, xg: 1.885 },
  { fdr: 2, xg: 1.688 },
  { fdr: 3, xg: 1.456 },
  { fdr: 4, xg: 1.278 },
  { fdr: 5, xg: 0.928 },
];

/** FDR 1 and 2 merged (weighted by starts). */
export function mergedBands(rows: { fdr: number; pts: number; n: number }[]) {
  const easy = rows.filter((r) => r.fdr <= 2);
  const n = easy.reduce((s, r) => s + r.n, 0);
  const pts = easy.reduce((s, r) => s + r.pts * r.n, 0) / n;
  return [{ label: '1–2', pts, n }, ...rows.filter((r) => r.fdr > 2).map((r) => ({ label: String(r.fdr), pts: r.pts, n: r.n }))];
}
