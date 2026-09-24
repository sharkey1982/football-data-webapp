// ============================================================================
// src/components/BroadcastBadge.tsx
//
// Compact "where to watch" marker for a fixture row. Deliberately quiet when
// there's nothing to say: a fixture with no broadcast rows at all (not yet
// determined) renders nothing, rather than a grey "TBC" on every single row
// in a list of 380 -- see summariseBroadcasts' three states.
// ============================================================================

import type { BroadcastSummary } from '../lib/broadcastsApi';

export default function BroadcastBadge({ summary }: { summary: BroadcastSummary }) {
  if (summary.kind === 'unknown') return null;

  if (summary.kind === 'not_televised') {
    return (
      <span className="text-[11px] text-ink-500 whitespace-nowrap" title="Confirmed not televised in the UK">
        Not on TV
      </span>
    );
  }

  const label = summary.broadcasters.length > 0 ? summary.broadcasters.join(' / ') : 'Streaming';
  return (
    <span
      className={`text-[11px] whitespace-nowrap font-medium ${summary.freeToAir ? 'text-pitch-800' : 'text-ink-700'}`}
      title={summary.freeToAir ? `${label} \u2014 free-to-air` : label}
    >
      <span aria-hidden="true">&#128250; </span>
      {label}
      {summary.freeToAir && <span className="text-pitch-800"> &middot; Free</span>}
    </span>
  );
}
