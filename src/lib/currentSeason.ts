// ============================================================================
// src/lib/currentSeason.ts
//
// "This season", read from the database instead of a constant. season_id is
// not in date order and changes every summer, so hard-coding 13 (2026/27)
// would silently keep every page on the old season after the rollover
// (docs/season-rollover.md).
//
//   getCurrentFplSeasonId() -- public.fpl_current_season_id(): the season FPL
//     has published gameweeks for. Use it for anything FPL (players, prices,
//     gameweeks, projections, Premier League fixtures on FPL pages).
//   getCurrentSeasonId()    -- public.current_season_id(): the football
//     season (1 July - 30 June). Use it for results, tables and betting.
//
// Each is fetched once per page load and shared. RPCs whose p_season_id has
// a server-side default of the current season don't need either: omit the
// argument.
// ============================================================================

import { supabase } from './supabase';

let fplSeason: Promise<number> | null = null;
let footballSeason: Promise<number> | null = null;

function cached(load: () => Promise<number>, get: () => Promise<number> | null, set: (p: Promise<number> | null) => void) {
  let p = get();
  if (!p) {
    p = load();
    set(p);
    // A failed lookup is not cached, so the next caller retries.
    p.catch(() => set(null));
  }
  return p;
}

export function getCurrentFplSeasonId(): Promise<number> {
  return cached(
    async () => {
      const { data, error } = await supabase.rpc('fpl_current_season_id');
      if (error) throw error;
      if (data == null) throw new Error('No current FPL season');
      return Number(data);
    },
    () => fplSeason,
    (p) => { fplSeason = p; }
  );
}

export function getCurrentSeasonId(): Promise<number> {
  return cached(
    async () => {
      const { data, error } = await supabase.rpc('current_season_id');
      if (error) throw error;
      if (data == null) throw new Error('No current season');
      return Number(data);
    },
    () => footballSeason,
    (p) => { footballSeason = p; }
  );
}

/** Test hook: forget the cached seasons. */
export function resetCurrentSeasonCache() {
  fplSeason = null;
  footballSeason = null;
}
