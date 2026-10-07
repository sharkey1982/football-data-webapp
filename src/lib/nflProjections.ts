// ============================================================================
// src/lib/nflProjections.ts
//
// NFL Player Projections: projected fantasy points per player for each team's next
// game (public.nfl_projections, written daily by scripts/nfl_projections.py).
//
// Method per position from Model Lab experiment NP1 (5 Oct 2026):
//   QB, WR, TE  'np1'        recency-weighted points x market team total x opponent
//   RB, K       'season_avg' the season average (NP1 did not beat it clearly)
// Every projection assumes the player plays; injury status is shown beside it.
// ============================================================================

import { supabase } from './supabase';
import type { ScoringFormat } from './nflFantasyApi';

export type ProjectionMethod = 'np1' | 'season_avg';

export type NflProjection = {
  game_id: string;
  season: number;
  week: number;
  kickoff_at: string | null;
  player_id: string;
  player_slug: string;
  player_name: string;
  position: string;
  team: string;
  team_slug: string;
  team_short: string;
  team_name: string;
  opponent: string;
  opponent_slug: string;
  opponent_short: string;
  at_home: boolean;
  method: ProjectionMethod;
  proj_ppr: number;
  proj_half: number;
  proj_std: number;
  low_ppr: number;
  high_ppr: number;
  base_ppr: number;
  season_avg_ppr: number | null;
  team_implied: number | null;
  team_usual: number | null;
  opp_factor: number | null;
  games_used: number;
  injury_status: string | null;
  injury: string | null;
  practice_status: string | null;
  computed_at: string;
};

export const PROJECTION_COLUMNS =
  'game_id,season,week,kickoff_at,player_id,player_slug,player_name,position,team,team_slug,team_short,team_name,opponent,opponent_slug,opponent_short,at_home,method,proj_ppr,proj_half,proj_std,low_ppr,high_ppr,base_ppr,season_avg_ppr,team_implied,team_usual,opp_factor,games_used,injury_status,injury,practice_status,computed_at';

/** Holdout result of NP1 (PPR mean absolute error per player-game; docs/experiments.md). */
export const NP1_RESULT: { pos: string; projector: number; average: number; passed: boolean }[] = [
  { pos: 'QB', projector: 6.5, average: 7.1, passed: true },
  { pos: 'WR', projector: 5.7, average: 6.3, passed: true },
  { pos: 'TE', projector: 5.2, average: 5.7, passed: true },
  { pos: 'RB', projector: 5.7, average: 6.0, passed: false },
  { pos: 'K', projector: 3.8, average: 4.1, passed: false },
];

const n = (x: number | string | null | undefined): number | null => (x == null ? null : Number(x));

/** Projection in a scoring format. */
export function projOf(r: Pick<NflProjection, 'proj_ppr' | 'proj_half' | 'proj_std'>, f: ScoringFormat): number {
  return Number(f === 'ppr' ? r.proj_ppr : f === 'half' ? r.proj_half : r.proj_std);
}

/** The 20th-80th percentile range, scaled to the format (fitted on PPR; the ratio carries over). */
export function rangeOf(r: Pick<NflProjection, 'proj_ppr' | 'proj_half' | 'proj_std' | 'low_ppr' | 'high_ppr'>, f: ScoringFormat): [number, number] {
  const p = Number(r.proj_ppr);
  const scale = p > 0 ? projOf(r, f) / p : 1;
  return [Number(r.low_ppr) * scale, Number(r.high_ppr) * scale];
}

/** Opponent factor as a signed percentage: +12% = gives up 12% more than average to the position. */
export function matchupPct(r: Pick<NflProjection, 'opp_factor'>): number | null {
  const f = n(r.opp_factor);
  return f == null ? null : Math.round((f - 1) * 100);
}

export function matchupLabel(r: Pick<NflProjection, 'opp_factor'>): string {
  const p = matchupPct(r);
  if (p == null) return '–';
  if (p === 0) return 'avg';
  return `${p > 0 ? '+' : '−'}${Math.abs(p)}%`;
}

/** "27 (usual 24)" -- the market's points for the team this game against its normal. */
export function teamPointsLabel(r: Pick<NflProjection, 'team_implied' | 'team_usual'>): string {
  const t = n(r.team_implied);
  const u = n(r.team_usual);
  if (t == null) return '–';
  return u == null ? `${t.toFixed(1)}` : `${t.toFixed(1)} (usual ${u.toFixed(1)})`;
}

/** Ruled out or doubtful: shown, but greyed and dropped from rankings by default. */
export const isUnlikely = (r: Pick<NflProjection, 'injury_status'>): boolean => r.injury_status === 'Out' || r.injury_status === 'Doubtful';

/** One sentence on why a projection is what it is. */
export function projectionSentence(r: NflProjection, f: ScoringFormat): string {
  const p = projOf(r, f).toFixed(1);
  if (r.method === 'season_avg') {
    return `${r.player_name}: ${p} points, his season average so far (for ${r.position === 'K' ? 'kickers' : 'running backs'} the projector did not clearly beat it in testing).`;
  }
  const bits: string[] = [];
  const t = n(r.team_implied);
  const u = n(r.team_usual);
  if (t != null && u != null) {
    const d = t - u;
    bits.push(Math.abs(d) < 1 ? `the ${r.team_short} expected to score about their usual ${t.toFixed(0)}` : `the ${r.team_short} expected to score ${t.toFixed(0)}, ${d > 0 ? 'more' : 'fewer'} than their usual ${u.toFixed(0)}`);
  }
  const m = matchupPct(r);
  if (m != null && Math.abs(m) >= 5) bits.push(`the ${r.opponent_short} give up ${Math.abs(m)}% ${m > 0 ? 'more' : 'less'} than average to ${r.position}s`);
  return `${r.player_name}: ${p} points from a recent ${Number(r.base_ppr).toFixed(1)} a game${bits.length ? `, with ${bits.join(' and ')}` : ''}.`;
}

// ---- Loaders -------------------------------------------------------------------------------

/** Every projection held (each team's next game: about 500 rows). */
export async function loadProjections(): Promise<NflProjection[]> {
  const rows: NflProjection[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('nfl_projections' as never).select(PROJECTION_COLUMNS).order('proj_ppr', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as NflProjection[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/** Projections for a set of games (e.g. one week). */
export async function loadProjectionsFor(gameIds: string[]): Promise<NflProjection[]> {
  if (!gameIds.length) return [];
  const { data, error } = await supabase.from('nfl_projections' as never).select(PROJECTION_COLUMNS).in('game_id', gameIds).order('proj_ppr', { ascending: false }).limit(3000);
  if (error) throw error;
  return (data ?? []) as unknown as NflProjection[];
}

export async function loadGameProjections(gameId: string): Promise<NflProjection[]> {
  const { data, error } = await supabase.from('nfl_projections' as never).select(PROJECTION_COLUMNS).eq('game_id', gameId).order('proj_ppr', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as NflProjection[];
}
