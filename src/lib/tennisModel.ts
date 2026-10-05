// ============================================================================
// src/lib/tennisModel.ts
//
// The tennis match model (5 Oct 2026), in the browser: who wins a meeting
// between two players, given the surface and best of three or five. The
// same coefficients are in tennis.model_p() (migration
// 20261005210000_tennis_model); keep the two in step.
//
// Inputs come from public.tennis_ratings (Elo overall and per surface, built
// from every played match since 2000/2007), each player's latest ranking and
// their previous meetings. Fitted on 2003-2015, scaled on 2016-2019, tested on
// 2020-2026: 64.8% of matches called right (bookmakers 68.1%), and its
// stated chances match how often favourites won.
// ============================================================================

/** The head-to-head page's opening pairs. */
export const DEFAULT_PAIR = { ATP: ['sinner-j', 'alcaraz-c'], WTA: ['sabalenka-a', 'swiatek-i'] } as const satisfies Record<'ATP' | 'WTA', readonly [string, string]>;

export const MODEL_SURFACES = ['Hard', 'Clay', 'Grass'] as const;
export type ModelSurface = (typeof MODEL_SURFACES)[number] | 'Carpet';

export const COEF = {
  elo: 0.7313,
  selo: 0.3997,
  lrank: 0.2286,
  eloExp: -0.2532,
  seloExp: 0.3175,
  seloBo5: 0.5583,
  h2h: 0.1453,
} as const;

/** Backtest, 2020-2026 (both tours), for the page's footnote. */
export const BACKTEST = { from: 2020, matches: 31944, modelRight: 0.648, marketRight: 0.681 } as const;

export type RatingRow = { player_id: number; surface: string; rating: number; matches: number; latest_rank: number | null; last_match: string | null };

export type ModelSide = {
  elo: number;
  eloMatches: number;
  surfaceElo: number;
  surfaceMatches: number;
  rank: number | null;
};

/** A player's model inputs on a surface: no matches on it yet means their overall rating stands in. */
export function sideFor(rows: RatingRow[], surface: string): ModelSide | null {
  const all = rows.find((r) => r.surface === 'All');
  if (!all) return null;
  const s = rows.find((r) => r.surface === surface);
  return { elo: all.rating, eloMatches: all.matches, surfaceElo: s?.rating ?? all.rating, surfaceMatches: s?.matches ?? 0, rank: all.latest_rank };
}

export type Factor = { key: keyof typeof COEF | 'rank'; label: string; logit: number };
export type Prediction = { pA: number; factors: Factor[] };

const lnRank = (r: number | null) => Math.log(r && r > 0 ? r : 1500);

/** Chance that A beats B. h2hA/h2hB: previous (played) meetings won by each. */
export function predict(a: ModelSide, b: ModelSide, bestOf: 3 | 5, h2hA: number, h2hB: number): Prediction {
  const dElo = (a.elo - b.elo) / 400;
  const dSelo = (a.surfaceElo - b.surfaceElo) / 400;
  const exp = Math.log(1 + Math.min(a.eloMatches, b.eloMatches)) / 5;
  const sexp = Math.log(1 + Math.min(a.surfaceMatches, b.surfaceMatches)) / 5;
  const factors: Factor[] = [
    // Overall form and experience act together: a big gap between two veterans counts a little less.
    { key: 'elo', label: 'Overall rating', logit: COEF.elo * dElo + COEF.eloExp * dElo * exp },
    { key: 'selo', label: 'Rating on this surface', logit: COEF.selo * dSelo + COEF.seloExp * dSelo * sexp },
    { key: 'seloBo5', label: 'Best of five (stretches the surface gap)', logit: bestOf === 5 ? COEF.seloBo5 * dSelo : 0 },
    { key: 'rank', label: 'Ranking', logit: COEF.lrank * (lnRank(b.rank) - lnRank(a.rank)) },
    { key: 'h2h', label: 'Previous meetings', logit: (COEF.h2h * (h2hA - h2hB)) / (h2hA + h2hB + 2) },
  ];
  const z = factors.reduce((s, f) => s + f.logit, 0);
  return { pA: 1 / (1 + Math.exp(-z)), factors };
}

/** Fair decimal odds for a chance (no margin). */
export const fairOdds = (p: number) => (p > 0 ? 1 / p : Infinity);
