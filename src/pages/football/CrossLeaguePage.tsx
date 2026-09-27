// ============================================================================
// src/pages/football/CrossLeaguePage.tsx
//
// Compares all five English divisions on the same axis, across every
// season in the archive.
//
// Built because it's something single-league sites structurally can't
// do -- and because the answer is genuinely non-obvious. The divisions
// turn out to be far more alike than most people would guess, which is
// itself the finding.
//
// Bars are plain divs, not a charting library: recharts was removed for
// costing 366KB, and a horizontal bar needs a width percentage, not a
// dependency. Every value is also in a real table below, so the numbers
// survive without CSS and can be read by anything that doesn't render.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getCrossLeagueSummary,
  aggregateByLeague,
  CROSS_LEAGUE_METRICS,
  type CrossLeagueRow,
  type CrossLeagueTotal,
} from '../../lib/crossLeagueApi';
import { seasonRange } from '../../lib/divisionEras';
import { seasonNameFromLabel } from '../../lib/seasonLabels';

const PYRAMID_ORDER = ['E0', 'E1', 'E2', 'E3', 'EC'];

/** No data as a dash, not 0. */
const show = (v: number | null, unit = '') => (v === null ? '\u2013' : `${v}${unit}`);

/** 'Premier League, Championship, League One and League Two from 1992/93;
 * National League from 2004/05' -- from the data, not a constant. */
function coverageSentence(rows: CrossLeagueTotal[]): string {
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    if (!groups.has(r.first_season)) groups.set(r.first_season, []);
    groups.get(r.first_season)!.push(r.league_name);
  }
  const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]);
  return [...groups.entries()].map(([first, names]) => `${list(names)} from ${seasonNameFromLabel(first)}`).join('; ');
}

export default function CrossLeaguePage() {
  const [rows, setRows] = useState<CrossLeagueRow[] | null>(null);
  const [metricKey, setMetricKey] = useState(CROSS_LEAGUE_METRICS[0].key);

  useDocumentHead({
    title: 'League Insights \u2014 how the English divisions compare',
    description:
      'Goals, home advantage, draws and bookings compared across the Premier League, Championship, League One, League Two and the National League, every season in the archive.',
    path: '/football/leagues-compared',
  });

  useEffect(() => {
    getCrossLeagueSummary()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const metric = CROSS_LEAGUE_METRICS.find((m) => m.key === metricKey)!;

  const totals = useMemo(() => (rows ? aggregateByLeague(rows) : []), [rows]);
  const ordered = useMemo(
    () => [...totals].sort((a, b) => PYRAMID_ORDER.indexOf(a.league_code) - PYRAMID_ORDER.indexOf(b.league_code)),
    [totals]
  );

  const withValue = ordered.filter((r) => r[metric.key] !== null);
  const values = withValue.map((r) => r[metric.key] as number);
  const max = values.length ? Math.max(...values) : 0;
  const highest = withValue.length ? withValue.reduce((a, b) => ((a[metric.key] as number) > (b[metric.key] as number) ? a : b)) : null;
  const lowest = withValue.length ? withValue.reduce((a, b) => ((a[metric.key] as number) < (b[metric.key] as number) ? a : b)) : null;
  const totalMatches = ordered.reduce((s, r) => s + r.matches, 0);
  // Measures some seasons lack (cards before 2000/01, early half-time scores).
  const partial = metric.key in (ordered[0]?.metric_seasons ?? {})
    ? ordered.filter((r) => r.metric_seasons[metric.key as keyof CrossLeagueTotal['metric_seasons']] < r.seasons)
    : [];

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;

  if (ordered.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Leagues compared</h1>
        <p className="text-ink-700 mt-2">No comparison data is available right now.</p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Football &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">League Insights</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          The whole English pyramid on one axis, from {totalMatches.toLocaleString()} matches. Most football sites cover one
          division, so this comparison is hard to find elsewhere &mdash; and the answer is not what most people expect.
        </p>
        <p className="text-ink-500 text-sm mt-2 max-w-prose">
          Every season in the archive: {coverageSentence(ordered)}. Divisions are named as they are today; earlier names are
          in the table.
        </p>
      </header>

      {/* A select rather than a row of buttons: twelve metrics as pills
          wraps into a crowded block, especially on a phone, and buries
          the chart below the fold. */}
      <label className="block max-w-sm">
        <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Compare</span>
        <select
          value={metricKey}
          onChange={(e) => setMetricKey(e.target.value as typeof metricKey)}
          className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
        >
          {CROSS_LEAGUE_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {highest && lowest && (
        <p className="text-ink-900 max-w-prose">{metric.describe(highest, lowest)}</p>
      )}

      <section aria-label={`${metric.label} by division`} className="space-y-2">
        {withValue.map((r) => {
          const value = r[metric.key] as number;
          const pct = max > 0 ? (value / max) * 100 : 0;
          return (
            <div key={r.league_code} className="flex items-center gap-3">
              <span className="w-32 sm:w-40 shrink-0 text-sm text-ink-700 truncate">{r.league_name}</span>
              <div className="flex-1 bg-chalk-200 rounded h-6 overflow-hidden">
                <div className="bg-pitch-700 h-full rounded" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums">
                {value}
                {metric.unit}
              </span>
            </div>
          );
        })}
        {partial.length > 0 && (
          <p className="text-xs text-ink-500 pt-1 max-w-prose">
            Only seasons with this data count:{' '}
            {partial
              .map((r) => `${r.league_name} ${r.metric_seasons[metric.key as keyof CrossLeagueTotal['metric_seasons']]} of ${r.seasons} seasons`)
              .join(', ')}
            .
          </p>
        )}
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Every division, every metric</h2>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Division</th>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Seasons</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Matches</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Goals/game</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Home wins</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Draws</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Yellows/game</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Reds/game</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r, i) => (
                <tr key={r.league_code} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                  <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                    {r.league_name}
                    {r.earlier_names && <span className="block text-[0.65rem] text-ink-500">{r.earlier_names}</span>}
                  </th>
                  <td className="px-3 py-1.5 text-xs font-mono whitespace-nowrap">{seasonRange(r.first_season, r.last_season)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.matches.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.goals_per_game}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.home_win_pct}%</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.draw_pct}%</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{show(r.yellows_per_game)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{show(r.reds_per_game)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/football/discover" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More to discover
        </Link>
        <Link to="/table" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          League tables
        </Link>
        <Link to="/results-data" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          The full match archive
        </Link>
      </nav>
    </article>
  );
}
