// ============================================================================
// src/lib/fplOptimizerApi.ts
//
// Client for the fpl-optimize-squad Edge Function. This module deliberately
// does NOT reimplement any of the optimisation logic -- it only sends a
// request and shapes the backend's response for the UI. Types below are
// transcribed directly from the function's actual deployed source
// (read via Supabase's edge-function API), not the informal field list
// from the brief, so they're exact rather than approximate.
//
// verify_jwt is false on this function, so the publishable-key client
// (src/lib/supabase.ts) can call it directly -- no service key involved.
// ============================================================================

import { supabase } from './supabase';

export type FplOptimizerPosition = 1 | 2 | 3 | 4; // 1=GK, 2=DEF, 3=MID, 4=FWD

export const OPTIMIZER_POSITION_LABEL: Record<FplOptimizerPosition, string> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

export type FplOptimizerPlayer = {
  id: number;
  name: string;
  team: string;
  position: FplOptimizerPosition;
  price: number;
  /** Sum of this player's expected points across every requested gameweek. */
  total_xpts: number;
  /** Average (start + sub-appearance) probability across the requested range, 0-1. */
  avg_appearance_probability: number;
  /** This player's expected points for each requested gameweek, keyed by matchweek number. */
  gw_xpts: Record<number, number>;
};

export type FplOptimizerWeeklyPlan = {
  matchweek: number;
  /** Starting-XI total expected points for this gameweek (captain NOT yet doubled). */
  xi_xpts: number;
  captain: string;
  vice_captain: string;
  captain_xpts: number;
};

export type FplOptimizerResult = {
  from_matchweek: number;
  to_matchweek: number;
  weeks: number[];
  budget: number;
  budget_used: number;
  bank: number;
  /** e.g. "3-4-3" -- the starting XI's outfield shape (DEF-MID-FWD counts). */
  base_formation: string;
  /** Total expected points across the whole range: starting XI + captain bonus each week, plus a small bench-value term. Not simply the sum of every squad player's total_xpts -- see the UI's own explanatory copy. */
  objective_xpts: number;
  /** All 15 players -- starting_core + bench, in that order. Usually easier to use starting_core/bench directly instead. */
  squad: FplOptimizerPlayer[];
  starting_core: FplOptimizerPlayer[];
  bench: FplOptimizerPlayer[];
  weekly_plan: FplOptimizerWeeklyPlan[];
  projection_model: string;
  version: string;
  notes: string[];
};

export type FplOptimizerError = {
  error: string;
};

function isOptimizerError(v: unknown): v is FplOptimizerError {
  return typeof v === 'object' && v !== null && 'error' in v && typeof (v as any).error === 'string';
}

/**
 * Calls fpl-optimize-squad for a gameweek range and budget. Throws with the
 * backend's own error message on failure (invalid range, no legal squad
 * found, missing projections for some week in range, etc) -- these are
 * already human-readable from the function itself, not re-worded here.
 */
export async function optimizeFplSquad(fromMatchweek: number, toMatchweek: number, budget: number): Promise<FplOptimizerResult> {
  const { data, error } = await supabase.functions.invoke('fpl-optimize-squad', {
    body: { from_matchweek: fromMatchweek, to_matchweek: toMatchweek, budget },
  });
  if (error) {
    // supabase-js only gives a generic transport-level error here; the
    // function's own error message (if any) is in the response body even
    // on a non-2xx status, so prefer that when present.
    const context = (error as any)?.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        if (isOptimizerError(body)) throw new Error(body.error);
      } catch {
        // fall through to the generic error below
      }
    }
    throw new Error(error.message || 'Failed to reach the squad optimiser');
  }
  if (isOptimizerError(data)) throw new Error(data.error);
  return data as FplOptimizerResult;
}
