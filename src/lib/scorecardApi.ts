// ============================================================================
// src/lib/scorecardApi.ts
//
// Model scorecard: the model's 1X2 forecasts against the closing market's, on
// every predicted league match with market odds (point-in-time retro-fits for
// past seasons). The database returns sums at the finest grain (division x
// season x team type x phase); everything here adds those up, so any filter
// combination is exact. Pure functions, tested without a network.
// ============================================================================

import { supabase } from './supabase';

export type ScorecardRow = {
  league_id: number;
  season_id: number;
  team_type: 'estimated' | 'relegated' | 'promoted' | 'established';
  phase: string;
  n: number;
  ll_model: number;
  ll_market: number;
  brier_model: number;
  brier_market: number;
  p_draw: number;
  m_draw: number;
  draws: number;
  pred_goals: number;
  goals: number;
};

export type CalibrationRow = { league_id: number; season_id: number; outcome: 'Home' | 'Draw' | 'Away'; bin: number; n: number; predicted: number; happened: number };

// Newer than the generated types; the row shapes above are the contract.
const rpc = (supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown; error: unknown }> }).rpc.bind(supabase);
const num = (v: unknown) => Number(v ?? 0);

export async function getScorecard(): Promise<ScorecardRow[]> {
  const { data, error } = await rpc('get_model_scorecard');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    league_id: num(r.league_id),
    season_id: num(r.season_id),
    team_type: r.team_type as ScorecardRow['team_type'],
    phase: String(r.phase),
    n: num(r.n),
    ll_model: num(r.ll_model),
    ll_market: num(r.ll_market),
    brier_model: num(r.brier_model),
    brier_market: num(r.brier_market),
    p_draw: num(r.p_draw),
    m_draw: num(r.m_draw),
    draws: num(r.draws),
    pred_goals: num(r.pred_goals),
    goals: num(r.goals),
  }));
}

export async function getCalibration(): Promise<CalibrationRow[]> {
  const { data, error } = await rpc('get_model_scorecard_calibration');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    league_id: num(r.league_id),
    season_id: num(r.season_id),
    outcome: r.outcome as CalibrationRow['outcome'],
    bin: num(r.bin),
    n: num(r.n),
    predicted: num(r.predicted),
    happened: num(r.happened),
  }));
}

export type Filter = { leagueId: number | null; seasonId: number | null };
export const matches = (f: Filter) => (r: { league_id: number; season_id: number }) =>
  (f.leagueId === null || r.league_id === f.leagueId) && (f.seasonId === null || r.season_id === f.seasonId);

/** ln(3): the log-loss of guessing a third each for home, draw and away. */
export const GUESS_LOG_LOSS = Math.log(3);

export type Score = {
  n: number;
  model: number | null; // mean log-loss (lower is better)
  market: number | null;
  gap: number | null; // model minus market
  /** How far the model gets from guessing towards the market: 100% = as good as the market. */
  skillVsMarket: number | null;
  drawPredicted: number | null;
  drawMarket: number | null;
  drawActual: number | null;
  goalsPredicted: number | null;
  goalsActual: number | null;
};

export function score(rows: ScorecardRow[]): Score {
  const t = rows.reduce(
    (a, r) => ({
      n: a.n + r.n, llm: a.llm + r.ll_model, llk: a.llk + r.ll_market, pd: a.pd + r.p_draw, md: a.md + r.m_draw,
      d: a.d + r.draws, pg: a.pg + r.pred_goals, g: a.g + r.goals,
    }),
    { n: 0, llm: 0, llk: 0, pd: 0, md: 0, d: 0, pg: 0, g: 0 },
  );
  if (t.n === 0)
    return { n: 0, model: null, market: null, gap: null, skillVsMarket: null, drawPredicted: null, drawMarket: null, drawActual: null, goalsPredicted: null, goalsActual: null };
  const model = t.llm / t.n;
  const market = t.llk / t.n;
  return {
    n: t.n,
    model,
    market,
    gap: model - market,
    skillVsMarket: GUESS_LOG_LOSS - market > 0 ? (GUESS_LOG_LOSS - model) / (GUESS_LOG_LOSS - market) : null,
    drawPredicted: t.pd / t.n,
    drawMarket: t.md / t.n,
    drawActual: t.d / t.n,
    goalsPredicted: t.pg / t.n,
    goalsActual: t.g / t.n,
  };
}

/** Group rows by a key and score each group, in the given key order. */
export function scoreBy<K extends string | number>(rows: ScorecardRow[], key: (r: ScorecardRow) => K, order?: K[]): { key: K; s: Score }[] {
  const groups = new Map<K, ScorecardRow[]>();
  for (const r of rows) {
    const k = key(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const keys = order ? order.filter((k) => groups.has(k)) : [...groups.keys()].sort();
  return keys.map((k) => ({ key: k, s: score(groups.get(k)!) }));
}

export type CalibrationPoint = { outcome: CalibrationRow['outcome']; bin: number; n: number; predicted: number; happened: number };

/** Calibration bins summed across the filter; bins with fewer than minN forecasts are dropped as noise. */
export function calibration(rows: CalibrationRow[], minN = 30): CalibrationPoint[] {
  const by = new Map<string, CalibrationPoint & { sumP: number; hits: number }>();
  for (const r of rows) {
    const k = `${r.outcome}|${r.bin}`;
    const c = by.get(k) ?? { outcome: r.outcome, bin: r.bin, n: 0, predicted: 0, happened: 0, sumP: 0, hits: 0 };
    c.n += r.n;
    c.sumP += r.predicted;
    c.hits += r.happened;
    by.set(k, c);
  }
  const rank = { Home: 0, Draw: 1, Away: 2 } as const;
  return [...by.values()]
    .filter((c) => c.n >= minN)
    .map((c) => ({ outcome: c.outcome, bin: c.bin, n: c.n, predicted: c.sumP / c.n, happened: c.hits / c.n }))
    .sort((a, b) => rank[a.outcome] - rank[b.outcome] || a.bin - b.bin);
}
