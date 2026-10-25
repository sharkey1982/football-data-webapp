// ============================================================================
// src/components/fpl/StartFlagsPanel.tsx
//
// "Check before the deadline" (25 Oct 2026, experiment D1): players the
// model gives a 60%+ start chance although they started at most once in
// their last five matches while fit, and who aren't a hand-set first
// choice. Usually a role or pecking-order entry that needs fixing (Man Utd
// GW8: Zirkzee, a fallback striker with no starts, published 90%).
// Admin only (fpl_start_flags_review is readable by admins).
// ============================================================================
import { useEffect, useState } from 'react';
import { getStartFlags, type StartFlag } from '../../lib/startFlagsApi';

const pct = (v: number) => `${Math.round(Number(v) * 100)}%`;

export function StartFlagsPanel() {
  const [rows, setRows] = useState<StartFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStartFlags()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p className="text-loss-700 text-sm">Couldn&rsquo;t load the start-chance check: {error}</p>;
  if (!rows) return null;

  // Next gameweek only: the one whose deadline matters now.
  const nextGw = rows.reduce<number | null>((m, r) => (r.matchweek != null && (m == null || r.matchweek < m) ? r.matchweek : m), null);
  const shown = nextGw == null ? rows : rows.filter((r) => r.matchweek === nextGw);

  return (
    <section className="border border-chalk-300 bg-white rounded-lg p-4" data-testid="start-flags">
      <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
        Check before the deadline{nextGw != null ? ` (GW${nextGw})` : ''}
      </h2>
      <p className="text-sm text-ink-500 mt-1 max-w-prose">
        The model gives these players a 60%+ chance to start, but they started at most once in their last five matches
        while fit and aren&rsquo;t set by hand as first choice. Usually their role or place in the pecking order needs fixing.
      </p>
      {shown.length === 0 ? (
        <p className="text-sm text-ink-700 mt-3">Nothing to check: every likely starter has the record to back it up.</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500">
                <th scope="col" className="py-1 pr-3 font-medium">Player</th>
                <th scope="col" className="py-1 pr-3 font-medium">Club</th>
                <th scope="col" className="py-1 pr-3 font-medium">Role</th>
                <th scope="col" className="py-1 pr-3 font-medium text-right">Start chance</th>
                <th scope="col" className="py-1 pr-3 font-medium text-right">Last 5 (started / fit)</th>
                <th scope="col" className="py-1 font-medium">Role from</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.fixture_id}-${r.fpl_player_id}`} className="border-t border-chalk-200">
                  <td className="py-1.5 pr-3 font-medium text-ink-900">{r.web_name}</td>
                  <td className="py-1.5 pr-3">{r.team ?? ''}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.tactical_role ?? ''}{r.depth_rank != null ? ` #${r.depth_rank}` : ''}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">
                    {pct(r.raw_probability)}{r.capped ? ` → ${pct(r.probability)}` : ''}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">
                    {r.starts_last ?? '?'} / {r.avail_last ?? '?'}
                  </td>
                  <td className="py-1.5 text-xs text-ink-500">{r.role_source === 'fpl_position_fallback' ? 'FPL position only' : (r.role_source ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
