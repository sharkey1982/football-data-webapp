// ============================================================================
// src/lib/fplOptimizerApi.ts
//
// Client for the fpl-optimize-squad Edge Function. Types below are
// transcribed directly from the function's actual deployed source (read
// via Supabase's edge-function API), not an informal field list -- and
// re-verified against the LIVE deployed version each time this file is
// touched, since the backend has already changed shape once (v1.5 -> v1.6)
// without the version number alone being an obvious signal from the UI
// side. v1.6's key difference from v1.5: there is no single squad-wide
// starting_core/bench/base_formation any more -- the best XI and
// formation are chosen INDEPENDENTLY for each gameweek in the range (see
// weekly_plan), because the model now picks the genuinely best legal XI
// per week rather than assuming one fixed shape holds for the whole
// range. squad is the flat list of all 15 players with no membership
// label; which of them are in a given week's XI has to be derived from
// that week's weekly_plan.xi (player names).
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
  /** This gameweek's own best legal formation -- can differ week to week within the same squad. */
  formation: string;
  /** Player NAMES in this gameweek's starting XI -- the backend gives no ID here, only name. */
  xi: string[];
  xi_xpts: number;
  captain: string;
  vice_captain: string;
  /** Extra expected value from captaincy this week (captain's own points plus a vice-captain hedge) -- NOT the captain's raw points. */
  captain_extra_ev: number;
  /** The 3 non-GK bench players, in auto-substitution priority order (names) -- the bench GK is not included here. */
  bench_order: string[];
  /** Expected value added by automatic substitutions this week, given each bench player's appearance probability. */
  auto_sub_ev: number;
};

export type FplOptimizerResult = {
  from_matchweek: number;
  to_matchweek: number;
  weeks: number[];
  budget: number;
  budget_used: number;
  bank: number;
  /** Total expected points across the whole range: each week's best XI + captaincy EV + auto-sub EV, summed. */
  objective_xpts: number;
  /** All 15 squad players, unlabelled -- use a given week's weekly_plan.xi/bench_order to see who plays that week. */
  squad: FplOptimizerPlayer[];
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

/** Coerces anything to a readable string without ever producing the classic
 * "[object Object]" (what `new Error(nonStringValue)` silently does by
 * calling the object's default toString). Never returns an empty string. */
function toMessage(v: unknown): string | null {
  if (typeof v === 'string') return v.length > 0 ? v : null;
  if (v instanceof Error) return v.message || null;
  if (v && typeof v === 'object') {
    try {
      const json = JSON.stringify(v);
      return json && json !== '{}' ? json : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Calls fpl-optimize-squad for a gameweek range and budget. Throws with the
 * backend's own error message on failure (invalid range, no legal squad
 * found, missing projections for some week in range, etc). Distinguishes a
 * genuine network-level failure (request never reached the function at
 * all -- e.g. connectivity) from a response the function itself returned,
 * since those need different messages to be useful.
 */
export async function optimizeFplSquad(fromMatchweek: number, toMatchweek: number, budget: number): Promise<FplOptimizerResult> {
  const { data, error } = await supabase.functions.invoke('fpl-optimize-squad', {
    body: { from_matchweek: fromMatchweek, to_matchweek: toMatchweek, budget },
  });
  if (error) {
    // supabase-js's FunctionsHttpError carries a generic message
    // ("Edge Function returned a non-2xx status code") on `error.message`
    // -- the function's own {error: "..."} body (returned even on a 4xx/5xx
    // status) lives on error.context, which is the raw fetch Response.
    // FunctionsFetchError (the request never reached the function at all --
    // no response to read a body from) has no usable context, and
    // error.message itself isn't always a plain string across SDK
    // versions, so everything here goes through toMessage() rather than
    // being interpolated directly.
    const context = (error as any)?.context;
    let backendMessage: string | null = null;
    if (context && typeof context.text === 'function') {
      try {
        const bodyText = await context.text();
        const body = bodyText ? JSON.parse(bodyText) : null;
        if (isOptimizerError(body)) backendMessage = body.error;
      } catch {
        // response body wasn't readable/valid JSON -- fall through
      }
    }
    if (backendMessage) throw new Error(backendMessage);
    const clientMessage = toMessage((error as any)?.message) ?? toMessage(error);
    const isNetworkLevel = !context || typeof context.text !== 'function';
    throw new Error(
      isNetworkLevel
        ? `Could not reach the squad optimiser \u2014 check your connection and try again.${clientMessage ? ` (${clientMessage})` : ''}`
        : (clientMessage ?? 'Failed to reach the squad optimiser')
    );
  }
  if (isOptimizerError(data)) throw new Error(data.error);
  return data as FplOptimizerResult;
}
