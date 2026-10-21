// ============================================================================
// src/lib/teamSlugs.ts
//
// team_id -> slug for every team, loaded once per visit and shared.
//
// Tool pages (League Table, Fixtures, Team Strength, Match Preview) work in
// team ids from their own queries; the team page lives at
// /football/teams/:slug. Rather than widen every one of those queries, they
// look the slug up here. ~700 rows, two columns: one small request, cached
// for the life of the page, so a name links as soon as it's on screen.
//
// Layout review, 21 Oct 2026: the most-visited pages were dead ends -- team
// names were plain text even though every team has its own page.
// ============================================================================

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type TeamSlugMap = ReadonlyMap<number, string>;

let cache: Promise<TeamSlugMap> | null = null;

export function loadTeamSlugs(): Promise<TeamSlugMap> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await supabase.from('teams').select('team_id, slug');
      if (error) throw error;
      const map = new Map<number, string>();
      for (const row of (data ?? []) as { team_id: number; slug: string | null }[]) {
        if (row.slug) map.set(row.team_id, row.slug);
      }
      return map;
    })().catch((err) => {
      // A failed load must not be cached: the next page that asks retries.
      cache = null;
      throw err;
    });
  }
  return cache;
}

/** Test hook: forget the cached map. */
export function resetTeamSlugCache(): void {
  cache = null;
}

/** The slug map, or an empty map until it arrives (names render as text
 *  meanwhile, then become links). A failure leaves them as text. */
export function useTeamSlugs(): TeamSlugMap {
  const [map, setMap] = useState<TeamSlugMap>(() => new Map());
  useEffect(() => {
    let live = true;
    loadTeamSlugs()
      .then((m) => live && setMap(m))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return map;
}
