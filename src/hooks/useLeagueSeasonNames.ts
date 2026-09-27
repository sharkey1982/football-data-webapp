import { useEffect, useState } from 'react';
import { getLeagueNamesForSeason } from '../lib/api';

/**
 * Division names as they were in a season (E1 in 1998/99 = "First
 * Division"), keyed by league_id. Empty until loaded, with no season, or
 * if the lookup fails -- callers fall back to today's league name, so the
 * worst case is the current name rather than a blank.
 */
export function useLeagueSeasonNames(seasonId: number | null): Map<number, string> {
  const [loaded, setLoaded] = useState<{ seasonId: number; names: Map<number, string> } | null>(null);

  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    getLeagueNamesForSeason(seasonId)
      .then((names) => { if (!cancelled) setLoaded({ seasonId, names }); })
      .catch(() => { if (!cancelled) setLoaded({ seasonId, names: new Map() }); });
    return () => { cancelled = true; };
  }, [seasonId]);

  // Never show one season's names against another season.
  return loaded && loaded.seasonId === seasonId ? loaded.names : EMPTY;
}

const EMPTY: Map<number, string> = new Map();
