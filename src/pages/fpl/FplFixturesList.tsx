import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getDefaultMatchweek } from '../../lib/fplSeasonApi';
import { getErrorMessage } from '../../lib/errorMessage';

// ============================================================================
// src/pages/fpl/FplFixturesList.tsx
//
// /fpl index -- redirects to the current/next relevant gameweek's browser
// at /fpl/gameweek/:matchweek. Kept as a thin redirect (rather than
// inlining the gameweek browser here) so /fpl/gameweek/:matchweek stays
// the one shareable, linkable URL for "a gameweek" instead of having two
// different routes that can show the same content.
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
  return <Navigate to={`/fpl/gameweek/${matchweek}`} replace />;
}
