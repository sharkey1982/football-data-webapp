// ============================================================================
// src/components/ServiceCoverageCard.tsx
//
// "Which service shows the most?" for the team or competition picked in the
// TV Guide (Chris, 7 Oct 2026). Counts the games in the guide that each UK
// service shows, from confirmed offers only, plus the best pair of services
// when one alone doesn't cover them all. Broadcasters pick games a few weeks
// ahead, so the card says how far the picks are known.
// ============================================================================

import { formatMatchDate } from '../lib/formatDate';
import { providerLabel, serviceCoverage, type WatchOffer } from '../lib/watchGuide';

type Props = {
  label: string;
  fixtures: { kickoffDate: string; offers: WatchOffer[] }[];
};

export default function ServiceCoverageCard({ label, fixtures }: Props) {
  const c = serviceCoverage(fixtures);
  if (c.games === 0) return null;
  const top = c.services[0];

  return (
    <section aria-label="Which service shows the most" className="mt-4 rounded border border-chalk-300 bg-white p-3">
      <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">Which service shows the most?</h2>
      <p className="text-xs text-ink-500 mt-0.5">
        {label}: {c.onTv} game{c.onTv === 1 ? '' : 's'} on UK TV
        {c.lastConfirmed && <> (picks known to {formatMatchDate(c.lastConfirmed)})</>}
        {c.notLive > 0 && <> &middot; {c.notLive} not on UK TV</>}
        {c.notPickedYet > 0 && <> &middot; {c.notPickedYet} later game{c.notPickedYet === 1 ? '' : 's'} not picked yet</>}
      </p>

      {c.services.length === 0 ? (
        <p className="text-sm text-ink-700 mt-2">No UK broadcasts confirmed yet.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-1.5">
            {c.services.map((s) => {
              const pct = Math.round((100 * s.games) / c.onTv);
              return (
                <li key={s.key} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 text-sm">
                  <span className="text-ink-900 truncate">
                    {s.label}
                    {s.free && <span className="ml-1 text-[10px] uppercase text-win-700">Free</span>}
                  </span>
                  <span className="h-2 rounded bg-chalk-200 overflow-hidden" aria-hidden="true">
                    <span className="block h-full bg-pitch-700" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="font-mono text-xs text-ink-700 text-right">
                    {s.games} &middot; {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-700 mt-2">
            {c.pair ? (
              <>
                {providerLabel(c.pair.keys[0])} + {providerLabel(c.pair.keys[1])} show {c.pair.games} of {c.onTv}.
              </>
            ) : (
              <>
                {top.label} shows {top.games === c.onTv ? 'all' : `${top.games} of`} {c.onTv}.
              </>
            )}
            {c.nowFolded && <> Sky Sports games also stream on NOW.</>}
          </p>
        </>
      )}
    </section>
  );
}
