// ============================================================================
// src/pages/fpl/ValuePage.tsx
//
// Points per million actually returned.
//
// Discover, not Predict: every number here is what happened. The
// contribution columns sit alongside deliberately, so the ratio can be
// interrogated rather than trusted -- 8.0 per million earned mostly from
// bonus is a different proposition from the same figure earned from
// goals, and a ratio off 90 minutes is not the same as one off a cameo.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getActualValueTable, type ValueRow } from '../../lib/valueApi';

const POSITIONS = ['All', 'GKP', 'DEF', 'MID', 'FWD'];

export default function ValuePage() {
  const [rows, setRows] = useState<ValueRow[] | null>(null);
  const [position, setPosition] = useState('All');
  const [minMinutes, setMinMinutes] = useState(180);

  useDocumentHead({
    title: 'FPL value: points per million',
    description:
      'Which Fantasy Premier League players have actually returned the most points per million spent, with the goals, assists, clean sheets and bonus behind each figure.',
    path: '/fpl/value',
  });

  useEffect(() => {
    getActualValueTable(13)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const view = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => (position === 'All' || r.position_label === position) && r.minutes >= minMinutes)
      .slice(0, 40);
  }, [rows, position, minMinutes]);

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (rows.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Points per million</h1>
        <p className="text-ink-700 mt-2">No scoring data is available yet.</p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Points per million</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          What players have actually returned for what they cost. Every figure here is points already scored &mdash; no
          projections.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosition(p)}
              className={[
                'text-sm rounded px-3 py-1.5 border transition-colors',
                p === position ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="block text-xs font-mono uppercase tracking-widest text-ink-500">Min minutes</span>
          <select
            value={minMinutes}
            onChange={(e) => setMinMinutes(Number(e.target.value))}
            className="mt-1 border border-chalk-300 rounded px-2 py-1.5 text-sm bg-white"
          >
            {/* A minutes floor matters more than it looks: without one the
                top of this table fills with players who scored once off
                the bench and never played again. */}
            {[0, 90, 180, 270].map((m) => (
              <option key={m} value={m}>{m === 0 ? 'Any' : `${m}+`}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Team</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Price</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Per &pound;m</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Mins</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">G</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">A</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">CS</th>
              <th scope="col" className="text-right font-medium text-xs px-3 py-2">Bonus</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={r.fpl_player_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal whitespace-nowrap">
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
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">&pound;{r.price.toFixed(1)}m</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.total_points}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">{r.points_per_million.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{r.minutes}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.goals}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.assists}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.clean_sheets}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.bonus}</td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-4 text-center text-ink-500 text-xs">Nobody matches that filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-ink-500 text-xs max-w-prose">
        Value uses each player&rsquo;s current price, which is the usual convention but a simplification: points were
        earned at whatever the price was at the time, so a player who has since risen looks slightly worse value than
        they were. Early in a season these ratios move a lot week to week.
      </p>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/start/discover" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More to discover
        </Link>
        <Link to="/fpl/player-points" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Projected points
        </Link>
      </nav>
    </article>
  );
}
