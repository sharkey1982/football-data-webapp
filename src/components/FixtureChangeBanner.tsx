// ============================================================================
// src/components/FixtureChangeBanner.tsx
//
// Notifies visitors when a Premier League fixture's kickoff has changed
// recently -- requested directly, since a postponement or TV-pick
// reschedule affects Fantasy planning. Dismissible per-session (a session
// Set, not persisted) rather than permanently, since new changes can
// appear at any time and a permanently-dismissed banner would hide them.
// ============================================================================

import { useEffect, useState } from 'react';
import { getRecentEplFixtureChanges, type EplFixtureChange } from '../lib/api';
import { formatMatchDateWithYear } from '../lib/formatDate';

export function FixtureChangeBanner() {
  const [changes, setChanges] = useState<EplFixtureChange[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    getRecentEplFixtureChanges(7)
      .then(setChanges)
      .catch(() => setChanges([]));
  }, []);

  const visible = changes.filter((c) => !dismissed.has(c.change_id));
  if (visible.length === 0) return null;

  return (
    <div className="border border-amber-500 bg-amber-500/10 rounded-lg px-4 py-3 mb-4 space-y-1.5">
      <p className="font-mono text-xs text-amber-700 uppercase tracking-widest">Fixture change{visible.length > 1 ? 's' : ''}</p>
      {visible.map((c) => (
        <div key={c.change_id} className="flex items-start justify-between gap-3 text-sm">
          <p className="text-ink-900">
            <span className="font-medium">
              {c.home_team_name} vs {c.away_team_name}
            </span>{' '}
            moved from {formatMatchDateWithYear(c.old_kickoff_date)} to{' '}
            <span className="font-medium">{formatMatchDateWithYear(c.new_kickoff_date)}</span>.
          </p>
          <button
            type="button"
            onClick={() => setDismissed((prev) => new Set(prev).add(c.change_id))}
            aria-label="Dismiss"
            className="text-ink-500 hover:text-ink-900 shrink-0"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
