// ============================================================================
// src/pages/football/CountryInsightsPage.tsx
//
// Every country's top flight on one axis for a season. Companion to
// League Insights (the English divisions compared). Bars are plain divs,
// as there: no charting dependency, and every value is also in the table.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getCountrySummary,
  comparableSeasons,
  defaultSeason,
  seasonName,
  rankBy,
  COUNTRY_METRICS,
  formatValue,
  type CountryRow,
} from '../../lib/countryInsightsApi';

const selectClass = 'mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white';
const labelClass = 'text-xs font-mono uppercase tracking-widest text-ink-500';


export default function CountryInsightsPage() {
  useDocumentHead({
    title: 'Country Insights \u2014 top flights compared',
    description: 'Goals, home advantage, draws and cards compared across the top division of every country on the site.',
    path: '/football/countries-compared',
  });

  const [rows, setRows] = useState<CountryRow[] | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState(COUNTRY_METRICS[0].key);

  useEffect(() => {
    getCountrySummary()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const seasons = useMemo(() => (rows ? comparableSeasons(rows) : []), [rows]);
  useEffect(() => {
    if (rows && season === null) setSeason(defaultSeason(rows, seasons));
  }, [rows, seasons, season]);

  const inSeason = useMemo(() => (rows ?? []).filter((r) => r.season_label === season), [rows, season]);
  const metric = COUNTRY_METRICS.find((m) => m.key === metricKey)!;
  const { ranked, missing } = useMemo(() => rankBy(inSeason, metric.key), [inSeason, metric.key]);
  const byCountry = useMemo(() => [...inSeason].sort((a, b) => a.country_name.localeCompare(b.country_name)), [inSeason]);
  const max = ranked.length ? (ranked[0][metric.key] as number) : 0;
  const totalMatches = inSeason.reduce((s, r) => s + r.matches, 0);

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;

  if (!season || inSeason.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Country Insights</h1>
        <p className="text-ink-700 mt-2">No comparison data is available right now.</p>
      </div>
    );
  }

  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Football &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Country Insights</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          {inSeason.length} top flights, {seasonName(season)}, {totalMatches.toLocaleString()} matches.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <label className="block">
          <span className={labelClass}>Season</span>
          <select value={season} onChange={(e) => setSeason(e.target.value)} className={selectClass}>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {seasonName(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Compare</span>
          <select value={metricKey} onChange={(e) => setMetricKey(e.target.value as typeof metricKey)} className={selectClass}>
            {COUNTRY_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {metric.note && <p className="text-sm text-ink-500 -mt-3">{metric.note}</p>}

      {top && bottom && top !== bottom && (
        <p className="text-ink-900">
          {`Highest: ${top.country_name} (${formatValue(top[metric.key], metric.decimals, metric.unit)}). Lowest: ${bottom.country_name} (${formatValue(bottom[metric.key], metric.decimals, metric.unit)}).`}
        </p>
      )}

      <section aria-label={`${metric.label} by country`} className="space-y-1.5">
        {ranked.map((r) => {
          const value = r[metric.key] as number;
          const pct = max > 0 ? (value / max) * 100 : 0;
          return (
            <div key={r.league_code} className="flex items-center gap-3">
              <span className="w-28 sm:w-36 shrink-0 text-sm text-ink-700 truncate" title={r.league_name}>
                {r.country_name}
              </span>
              <div className="flex-1 bg-chalk-200 rounded h-5 overflow-hidden">
                <div className="bg-pitch-700 h-full rounded" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums">{formatValue(value, metric.decimals, metric.unit)}</span>
            </div>
          );
        })}
        {missing.length > 0 && (
          <p className="text-xs text-ink-500 pt-1">No data: {missing.map((r) => r.country_name).join(', ')}.</p>
        )}
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Every country, every metric</h2>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Country</th>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">League</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Matches</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Goals/game</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Home wins</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Draws</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Away wins</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Over 2.5</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Yellows/game</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Reds/game</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points spread</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Bottom v top half</th>
              </tr>
            </thead>
            <tbody>
              {byCountry.map((r, i) => (
                <tr key={r.league_code} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                  <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal whitespace-nowrap">{r.country_name}</th>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">{r.league_name}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.matches.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.goals_per_game, 2)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.home_win_pct, 1, '%')}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.draw_pct, 1, '%')}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.away_win_pct, 1, '%')}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.over_two_five_pct, 1, '%')}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.yellows_per_game, 2)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.reds_per_game, 3)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.points_spread, 2)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{formatValue(r.bottom_not_losing_pct, 1, '%')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/football/leagues-compared" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          League Insights
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
