// ============================================================================
// src/pages/fpl/InjuriesPage.tsx
//
// Who's unavailable, and what it actually costs in fixtures.
//
// Sorted by ownership, because the question a manager has is "does this
// affect MY team" -- a 67%-owned doubt matters more than a 0.2%-owned
// one, regardless of severity.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getInjuryReport, STATUS_LABEL, type InjuryRow } from '../../lib/injuryApi';
import { formatMatchDateWithYear } from '../../lib/formatDate';

type Filter = 'all' | 'out' | 'doubtful';

function StatusPill({ status, chance }: { status: string; chance: number | null }) {
  const label = STATUS_LABEL[status] ?? status;
  const tone =
    status === 'd' ? 'bg-amber-500 text-ink-900' : status === 'i' || status === 's' ? 'bg-loss-700 text-chalk-100' : 'bg-chalk-300 text-ink-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide ${tone}`}>
      {label}
      {status === 'd' && chance != null ? ` ${chance}%` : ''}
    </span>
  );
}

export default function InjuriesPage() {
  const [rows, setRows] = useState<InjuryRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useDocumentHead({
    title: 'FPL injuries and availability',
    description:
      'Who is injured, doubtful or suspended in Fantasy Premier League, with how many fixtures each absence actually costs.',
    path: '/fpl/injuries',
  });

  useEffect(() => {
    getInjuryReport(13)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const view = useMemo(() => {
    if (!rows) return [];
    const withNews = rows.filter((r) => r.news);
    if (filter === 'out') return withNews.filter((r) => r.status === 'i' || r.status === 's');
    if (filter === 'doubtful') return withNews.filter((r) => r.status === 'd');
    return withNews;
  }, [rows, filter]);

  // The genuinely interesting case: a long absence that costs few
  // fixtures because a break absorbs it.
  const breakCushioned = useMemo(
    () => view.filter((r) => r.fixtures_missed != null && r.fixtures_missed <= 1 && r.return_date),
    [view]
  );

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (rows.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Injuries &amp; availability</h1>
        <p className="text-ink-700 mt-2">No availability data is available right now.</p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Injuries &amp; availability</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Who&rsquo;s out, who&rsquo;s doubtful, and &mdash; where a return date is known &mdash; how many fixtures the
          absence actually costs. A three-week injury can cost one match or four, depending entirely on where the
          international break falls.
        </p>
      </header>

      {breakCushioned.length > 0 && (
        <section className="border border-chalk-300 rounded-lg bg-white p-4">
          <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">Cushioned by the break</h2>
          <p className="text-ink-700 text-sm mt-1">
            These absences look long but cost almost nothing, because the fixture calendar absorbs them:
          </p>
          <ul className="mt-2 space-y-1">
            {breakCushioned.slice(0, 5).map((r) => (
              <li key={r.fpl_player_id} className="text-sm">
                <span className="font-medium text-ink-900">{r.web_name}</span>{' '}
                <span className="text-ink-500">({r.team_name})</span> &mdash; back{' '}
                {r.return_date && formatMatchDateWithYear(r.return_date)}, misses{' '}
                <strong>{r.fixtures_missed === 0 ? 'no fixtures' : `${r.fixtures_missed} fixture`}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {([['all', 'Everyone'], ['out', 'Out'], ['doubtful', 'Doubtful']] as [Filter, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={[
              'text-sm rounded px-3 py-1.5 border transition-colors',
              k === filter ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Team</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Status</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Reported</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Fixtures missed</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Owned</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={r.fpl_player_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                  {r.slug ? (
                    <Link to={`/fpl/players/${r.slug}`} className="text-pitch-800 underline underline-offset-2">
                      {r.web_name}
                    </Link>
                  ) : (
                    r.web_name
                  )}
                  <span className="text-ink-500"> {r.position_label}</span>
                </th>
                <td className="px-3 py-1.5 text-xs text-ink-700">{r.team_name ?? '\u2014'}</td>
                <td className="px-3 py-1.5"><StatusPill status={r.status} chance={r.chance_next_round} /></td>
                <td className="px-3 py-1.5 text-xs text-ink-700">{r.news}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                  {/* Null is unknown, not zero -- FPL often states no
                      return date at all, and "0" would read as "misses
                      nothing", which is the opposite of the truth. */}
                  {r.fixtures_missed == null ? <span className="text-ink-500">unknown</span> : r.fixtures_missed}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                  {r.ownership == null ? '\u2014' : `${r.ownership.toFixed(1)}%`}
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-ink-500 text-xs">Nobody in this category.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-ink-500 text-xs max-w-prose">
        Return dates come from the official FPL feed and are frequently absent or optimistic. Where none is stated the
        fixture count shows as unknown rather than zero.
      </p>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/start/discover" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More to discover
        </Link>
        <Link to="/fpl/market" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          The FPL market
        </Link>
      </nav>
    </article>
  );
}
