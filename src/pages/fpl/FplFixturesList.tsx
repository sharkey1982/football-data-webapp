import { useEffect, useState } from 'react';
import GameweekPage from './GameweekPage';
import { getDefaultMatchweek } from '../../lib/fplSeasonApi';
import { getErrorMessage } from '../../lib/errorMessage';

// ============================================================================
// src/pages/fpl/FplFixturesList.tsx
//
// /fpl index -- shows the current/next relevant gameweek's browser in place,
// with /fpl as its canonical. Until 7 Oct 2026 this redirected (in the
// browser) to /fpl/gameweek/:matchweek, so the sitemap listed /fpl while the
// rendered page declared /fpl/gameweek/6 canonical -- a URL that moves every
// week, so Google could never settle on one. /fpl/gameweek/:matchweek keeps
// its own canonical for a specific week; picking another week navigates there.
// ============================================================================

export default function FplFixturesList() {
  const [matchweek, setMatchweek] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDefaultMatchweek()
      .then((mw) => {
        if (!cancelled) setMatchweek(mw);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load gameweek'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-loss-700 text-sm">{error}</p>;
  if (matchweek === null) return <p className="text-ink-500 font-mono text-sm">{'Loading\u2026'}</p>;
  return <GameweekPage currentWeek={matchweek} canonicalPath="/fpl" />;
}
