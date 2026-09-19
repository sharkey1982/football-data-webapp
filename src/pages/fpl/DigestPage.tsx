// ============================================================================
// src/pages/fpl/DigestPage.tsx
//
// What changed since yesterday.
//
// Factual throughout -- what moved, not what will -- so this sits in
// Discover. The Trading Floor's forecast of what might move next lives
// in Predict.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getDailyDigest,
  notable,
  CHANGE_LABELS,
  CHANGE_ORDER,
  type DigestEntry,
  type DigestChangeType,
} from '../../lib/digestApi';
import { formatMatchDateWithYear } from '../../lib/formatDate';

export default function DigestPage() {
  const [entries, setEntries] = useState<DigestEntry[] | null>(null);
  const [notableOnly, setNotableOnly] = useState(true);

  useDocumentHead({
    title: 'What changed in FPL today',
    description:
      'Fantasy Premier League price rises and falls, availability news and ownership swings since the last update.',
    path: '/fpl/whats-changed',
  });

  useEffect(() => {
    getDailyDigest(13)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  const view = useMemo(() => (notableOnly ? notable(entries ?? []) : entries ?? []), [entries, notableOnly]);

  const grouped = useMemo(() => {
    const m = new Map<DigestChangeType, DigestEntry[]>();
    for (const e of view) {
      if (!m.has(e.change_type)) m.set(e.change_type, []);
      m.get(e.change_type)!.push(e);
    }
    return CHANGE_ORDER.filter((k) => m.has(k)).map((k) => ({ key: k, items: m.get(k)! }));
  }, [view]);

  if (entries === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (entries.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">What&rsquo;s changed</h1>
        <p className="text-ink-700 mt-2">Nothing has moved since the last update.</p>
      </div>
    );
  }

  const window_ = entries[0];

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">What&rsquo;s changed</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Everything that moved since the last update &mdash; prices, availability and ownership. What happened, not what
          might.
        </p>
        <p className="text-xs text-ink-500 font-mono mt-2">
          <time dateTime={window_.from_date}>{formatMatchDateWithYear(window_.from_date)}</time> &rarr;{' '}
          <time dateTime={window_.to_date}>{formatMatchDateWithYear(window_.to_date)}</time>
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setNotableOnly(true)}
          className={[
            'text-sm rounded px-3 py-1.5 border transition-colors',
            notableOnly ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
          ].join(' ')}
        >
          Worth knowing
        </button>
        <button
          type="button"
          onClick={() => setNotableOnly(false)}
          className={[
            'text-sm rounded px-3 py-1.5 border transition-colors',
            !notableOnly ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
          ].join(' ')}
        >
          Everything ({entries.length})
        </button>
      </div>

      {grouped.length === 0 && (
        <p className="text-ink-500 text-sm">Nothing notable moved. Switch to &ldquo;Everything&rdquo; for the full list.</p>
      )}

      {grouped.map(({ key, items }) => (
        <section key={key}>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
            {CHANGE_LABELS[key]} <span className="text-ink-500 font-mono text-sm">({items.length})</span>
          </h2>
          <ul className="mt-2 space-y-1.5">
            {items.map((e) => (
              <li key={`${e.change_type}-${e.fpl_player_id}`} className="text-sm flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink-900">
                  {e.slug ? (
                    <Link to={`/fpl/players/${e.slug}`} className="text-pitch-800 underline underline-offset-2">
                      {e.web_name}
                    </Link>
                  ) : (
                    e.web_name
                  )}
                </span>
                <span className="text-ink-500">
                  {e.team_name} &middot; {e.position_label} &middot; {e.ownership.toFixed(1)}% owned
                </span>
                <span className="font-mono text-xs text-ink-900">
                  {e.old_value} &rarr; {e.new_value}
                </span>
                {e.detail && <span className="text-ink-700 text-xs w-full sm:w-auto">{e.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-ink-500 text-xs max-w-prose">
        &ldquo;Worth knowing&rdquo; keeps changes affecting players owned by at least 5% of squads, plus every
        availability change regardless of ownership &mdash; a newly injured player nobody owns yet is exactly what&rsquo;s
        worth hearing early.
      </p>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/price-risk" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          What might move next
        </Link>
        <Link to="/fpl/injuries" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Physio room
        </Link>
      </nav>
    </article>
  );
}
