// ============================================================================
// src/pages/football/CountryInsightsPage.tsx
//
// Every country's top flight on one axis, for one season or several pooled.
// Companion to League Insights (the English divisions compared). Bars are
// plain divs, as there: no charting dependency, and every value is also in
// the table.
//
// Coverage differs by country (England and the big four from 2011/12, the
// others from 2016/17), so a multi-season period compares each country over
// the seasons in it that the country has data for, and the page says which.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getCountrySummary,
  periodOptions,
  poolSeasons,
  coverageGroups,
  rankBy,
  COUNTRY_METRICS,
  formatValue,
  seasonName,
  type CountryRow,
  type CountryPeriodRow,
} from '../../lib/countryInsightsApi';

const selectClass = 'mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white';
const labelClass = 'text-xs font-mono uppercase tracking-widest text-ink-500';

const seasonsText = (r: CountryPeriodRow) =>
  r.first_season === r.last_season ? seasonName(r.first_season) : `${seasonName(r.first_season)}–${seasonName(r.last_season)}`;

export default function CountryInsightsPage() {
  useDocumentHead({
    title: 'Country Insights — top flights compared',
    description: 'Goals, home advantage, draws and cards compared across the top division of every country on the site.',
    path: '/football/countries-compared',
  });

  const [rows, setRows] = useState<CountryRow[] | null>(null);
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState(COUNTRY_METRICS[0].key);

  useEffect(() => {
    getCountrySummary()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const options = useMemo(() => (rows ? periodOptions(rows) : { windows: [], singles: [], defaultKey: null }), [rows]);
  // Until the reader picks one: the last full season.
  const activeKey = periodKey ?? options.defaultKey;
  const period = useMemo(
    () => [...options.windows, ...options.singles].find((o) => o.key === activeKey) ?? null,
    [options, activeKey]
  );
  const inPeriod = useMemo(() => (rows && period ? poolSeasons(rows, period.seasons) : []), [rows, period]);
  const metric = COUNTRY_METRICS.find((m) => m.key === metricKey)!;
  const { ranked, missing } = useMemo(() => rankBy(inPeriod, metric.key), [inPeriod, metric.key]);
  const byCountry = useMemo(() => [...inPeriod].sort((a, b) => a.country_name.localeCompare(b.country_name)), [inPeriod]);
  const coverage = useMemo(() => coverageGroups(inPeriod), [inPeriod]);
  const max = ranked.length ? (ranked[0][metric.key] as number) : 0;
  const totalMatches = inPeriod.reduce((s, r) => s + r.matches, 0);
  const isWindow = period?.kind === 'window';
  // Countries whose value for this measure rests on fewer seasons than
  // their coverage (e.g. no cards in a season's source file).
  const shortfall = isWindow ? ranked.filter((r) => r.metric_seasons[metric.key] < r.seasons) : [];

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;

  if (!period || inPeriod.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Country Insights</h1>
        <p className="text-ink-700 mt-2">No comparison data is available right now.</p>
      </div>
    );
  }

  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  const periodText = isWindow ? `${period.range} (${period.name.toLowerCase()})` : period.range;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Football &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Country Insights</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          {inPeriod.length} top flights, {periodText}, {totalMatches.toLocaleString()} matches.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <label className="block">
          <span className={labelClass}>Period</span>
          <select value={period.key} onChange={(e) => setPeriodKey(e.target.value)} className={selectClass}>
            {options.windows.length > 0 && (
              <optgroup label="Several seasons">
                {options.windows.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="One season">
              {options.singles.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
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

      {isWindow && (
        <section aria-label="Seasons covered" className="text-sm text-ink-700 max-w-prose space-y-1 -mt-2">
          {coverage.length === 1 ? (
            <p>Every country has all {coverage[0].seasons} seasons, {coverage[0].range}.</p>
          ) : (
            <>
              <p>Each country is measured over the seasons in this period that it has data for:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {coverage.map((g) => (
                  <li key={`${g.range}|${g.seasons}`}>
                    <span className="font-mono text-xs">{g.range}</span> ({g.seasons} {g.seasons === 1 ? 'season' : 'seasons'}):{' '}
                    {g.countries.join(', ')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

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
        {shortfall.length > 0 && (
          <p className="text-xs text-ink-500 pt-1">
            Fewer seasons for this measure (no data in the source for the others):{' '}
            {shortfall.map((r) => `${r.country_name} ${r.metric_seasons[metric.key]} of ${r.seasons}`).join(', ')}.
          </p>
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
                {isWindow && <th scope="col" className="text-left font-medium text-xs px-3 py-2">Seasons</th>}
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
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                    {r.league_name}
                    {r.earlier_names && <span className="block text-[0.65rem] text-ink-500">{r.earlier_names}</span>}
                  </td>
                  {isWindow && (
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap font-mono">
                      {seasonsText(r)} <span className="text-ink-500">({r.seasons})</span>
                    </td>
                  )}
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
        {isWindow && (
          <p className="text-xs text-ink-500 mt-2 max-w-prose">
            Over several seasons, averages are weighted by matches played. The two competitiveness measures are worked
            out for each season&rsquo;s table, so they are the mean of the seasons&rsquo; figures.
          </p>
        )}
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
