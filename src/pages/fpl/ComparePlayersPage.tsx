// ============================================================================
// src/pages/fpl/ComparePlayersPage.tsx
//
// /fpl/compare?players=a,b,c&from=6&to=10 -- up to five players side by side.
// Players are columns, measures are rows (labels pinned on the left so a
// phone scrolls sideways through the players). The URL carries the whole
// comparison, so it can be shared. Projections come from the same rows as
// Player Projections (the same start chances and minutes Minutes Outlook shows); season figures are FPL's own. Each block says which.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import GameweekRangeFilter from '../../components/fpl/GameweekRangeFilter';
import { getDefaultMatchweek, getGameweekInPlay } from '../../lib/fplSeasonApi';
import {
  MAX_COMPARE,
  getComparePlayerOptions,
  getComparison,
  parsePlayersParam,
  per90,
  type ComparePlayer,
  type ComparePlayerOption,
} from '../../lib/fplCompareApi';

type Measure = {
  key: string;
  label: string;
  hint?: string;
  value: (p: ComparePlayer) => number | null;
  format: (v: number) => string;
  /** Mark the best value in the row (higher is better). Off for context rows. */
  best?: boolean;
};

const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function ukTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function fdrClass(fdr: number | null): string {
  if (fdr == null) return 'bg-chalk-200 text-ink-700';
  if (fdr <= 2) return 'bg-pitch-600 text-chalk-100';
  if (fdr === 3) return 'bg-chalk-200 text-ink-900';
  if (fdr === 4) return 'bg-loss-600/80 text-chalk-100';
  return 'bg-loss-700 text-chalk-100';
}

function bestIndexes(values: (number | null)[]): Set<number> {
  const real = values.filter((v): v is number => v != null);
  if (real.length < 2) return new Set();
  const top = Math.max(...real);
  if (real.every((v) => Math.abs(v - top) < 1e-9)) return new Set();
  return new Set(values.map((v, i) => (v != null && Math.abs(v - top) < 1e-9 ? i : -1)).filter((i) => i >= 0));
}

export default function ComparePlayersPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Writes the query string by hand so the shared link keeps plain commas
  // (?players=a,b,c) rather than %2C.
  const setParams = (next: URLSearchParams, opts?: { replace?: boolean }) => {
    const parts: string[] = [];
    for (const [k, v] of next) parts.push(`${encodeURIComponent(k)}=${k === 'players' ? v.split(',').map(encodeURIComponent).join(',') : encodeURIComponent(v)}`);
    navigate({ search: parts.length ? `?${parts.join('&')}` : '' }, { replace: opts?.replace });
  };
  const slugs = useMemo(() => parsePlayersParam(params.get('players')), [params]);
  const fromParam = Number(params.get('from')) || null;
  const toParam = Number(params.get('to')) || null;

  const [options, setOptions] = useState<ComparePlayerOption[] | null>(null);
  const [players, setPlayers] = useState<ComparePlayer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [defaultGw, setDefaultGw] = useState<number | null>(null);
  const [inPlay, setInPlay] = useState<{ gw: number; played: number; total: number } | null>(null);
  const [fromGw, setFromGw] = useState<number | null>(fromParam);
  const [toGw, setToGw] = useState<number | null>(toParam);

  useDocumentHead({
    title: 'Compare FPL players — projections and minutes side by side',
    description:
      'Up to five Fantasy Premier League players side by side: projected points, expected goals and assists, expected minutes and start chance, fixtures and season record.',
    path: '/fpl/compare',
  });

  useEffect(() => {
    getComparePlayerOptions().then(setOptions).catch(() => setOptions([]));
    getDefaultMatchweek().then(setDefaultGw).catch(() => setDefaultGw(null));
    getGameweekInPlay().then(setInPlay).catch(() => setInPlay(null));
  }, []);

  // The range lives in the URL too, so a shared link opens on the same weeks.
  const setRange = (f: number | null, t: number | null) => {
    setFromGw(f);
    setToGw(t);
    const next = new URLSearchParams(params);
    if (f != null && t != null) {
      next.set('from', String(f));
      next.set('to', String(t));
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (slugs.length === 0) { setPlayers([]); return; }
    if (fromGw == null || toGw == null || toGw < fromGw) return;
    let live = true;
    setLoading(true);
    setError(null);
    getComparison(slugs, fromGw, toGw)
      .then((p) => { if (live) setPlayers(p); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load the comparison.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [slugs, fromGw, toGw]);

  const setSlugs = (next: string[]) => {
    const p = new URLSearchParams(params);
    if (next.length) p.set('players', next.join(','));
    else p.delete('players');
    setParams(p, { replace: true });
  };

  const optionByLabel = useMemo(() => {
    const m = new Map<string, ComparePlayerOption>();
    for (const o of options ?? []) m.set(`${o.web_name} (${o.team_name}, ${o.position}, £${o.price.toFixed(1)}m)`, o);
    return m;
  }, [options]);

  const addFromQuery = (label: string) => {
    const o = optionByLabel.get(label);
    if (!o || slugs.includes(o.slug) || slugs.length >= MAX_COMPARE) return;
    setSlugs([...slugs, o.slug]);
    setQuery('');
  };

  const shown = players ?? [];
  const weeksInRange = fromGw != null && toGw != null ? toGw - fromGw + 1 : 0;
  const missing = slugs.filter((s) => players && !players.some((p) => p.slug === s));

  const rangeMeasures: Measure[] = [
    { key: 'xpts', label: 'Projected points', value: (p) => p.totals.xpts, format: f1, best: true },
    { key: 'xg', label: 'Expected goals', value: (p) => p.totals.xg, format: f2, best: true },
    { key: 'xa', label: 'Expected assists', value: (p) => p.totals.xa, format: f2, best: true },
    { key: 'xg90', label: 'xG per 90', hint: 'Expected goals per 90 expected minutes', value: (p) => per90(p.totals.xg, p.totals.minutes), format: f2, best: true },
    { key: 'xmin', label: 'Expected minutes a game', hint: 'Start chance × minutes when starting, plus sub appearances', value: (p) => (p.totals.fixtures ? p.totals.minutes / p.totals.fixtures : null), format: (v) => v.toFixed(0), best: true },
    { key: 'start', label: 'Start chance', value: (p) => p.totals.start, format: pct, best: true },
    { key: 'ppm', label: 'Points per £m', hint: 'Projected points over the range ÷ price', value: (p) => (p.price ? p.totals.xpts / p.price : null), format: f2, best: true },
  ];
  const seasonMeasures: Measure[] = [
    { key: 'pts', label: 'Points', value: (p) => p.season_points, format: (v) => v.toFixed(0) },
    { key: 'mins', label: 'Minutes', value: (p) => p.season_minutes, format: (v) => v.toFixed(0) },
    { key: 'sxg', label: 'xG', value: (p) => p.season_xg, format: f2 },
    { key: 'sxa', label: 'xA', value: (p) => p.season_xa, format: f2 },
  ];
  const generated = shown.map((p) => p.generated_at).filter(Boolean).sort().pop() ?? null;

  const labelCell = 'sticky left-0 z-10 bg-white text-left text-[11px] sm:text-xs font-medium text-ink-700 px-2 py-1.5 min-w-[6.25rem] max-w-[6.25rem] sm:min-w-[9rem] sm:max-w-[9rem] border-r border-chalk-200';
  const sectionRow = (title: string, note: string) => (
    <tr className="bg-chalk-100">
      <th colSpan={shown.length + 1} className="text-left px-2 py-1.5">
        <span className="sticky left-2 inline-block">
          <span className="font-display uppercase tracking-wide text-xs text-ink-900">{title}</span>
          <span className="ml-2 text-[11px] font-normal text-ink-500">{note}</span>
        </span>
      </th>
    </tr>
  );
  const measureRow = (m: Measure) => {
    const values = shown.map((p) => m.value(p));
    const best = m.best ? bestIndexes(values) : new Set<number>();
    return (
      <tr key={m.key} className="border-t border-chalk-200">
        <th scope="row" className={labelCell} title={m.hint}>{m.label}</th>
        {values.map((v, i) => (
          <td
            key={shown[i].slug}
            data-testid={`cell-${m.key}`}
            className={['px-1.5 sm:px-2 py-1.5 text-right font-mono text-sm', best.has(i) ? 'bg-pitch-600/15 font-semibold text-pitch-800' : 'text-ink-900'].join(' ')}
          >
            {v == null ? '—' : m.format(v)}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Compare Players</h1>
        <p className="text-sm text-ink-500 mt-1">
          Up to {MAX_COMPARE} players side by side. Copy the address to share the comparison.
        </p>
      </div>

      <div className="bg-white border border-chalk-300 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {slugs.map((s) => {
            const o = options?.find((x) => x.slug === s);
            return (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-pitch-800 text-chalk-100 text-xs px-2.5 py-1">
                {o ? o.web_name : s}
                <button
                  type="button"
                  aria-label={`Remove ${o ? o.web_name : s}`}
                  className="ml-0.5 opacity-80 hover:opacity-100"
                  onClick={() => setSlugs(slugs.filter((x) => x !== s))}
                >
                  &times;
                </button>
              </span>
            );
          })}
          {slugs.length < MAX_COMPARE && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); addFromQuery(query); }}
            >
              <input
                list="compare-player-options"
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (optionByLabel.has(e.target.value)) addFromQuery(e.target.value); }}
                placeholder={options ? 'Add a player…' : 'Loading players…'}
                aria-label="Add a player"
                className="border border-chalk-300 rounded-md px-2 py-1 text-sm w-56 max-w-full"
              />
              <datalist id="compare-player-options">
                {(options ?? []).filter((o) => !slugs.includes(o.slug)).map((o) => {
                  const label = `${o.web_name} (${o.team_name}, ${o.position}, £${o.price.toFixed(1)}m)`;
                  return <option key={o.slug} value={label} />;
                })}
              </datalist>
            </form>
          )}
        </div>
        <GameweekRangeFilter
          inPlay={inPlay}
          defaultGw={defaultGw}
          fromGw={fromGw}
          toGw={toGw}
          onChange={setRange}
          initialPreset={fromParam != null && toParam != null ? 'custom' : 'next5'}
          presets={['next', 'next3', 'next5', 'next10', 'custom']}
        />
      </div>

      {error && <p className="text-loss-700 text-sm">{error}</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {missing.length > 0 && !loading && (
        <p className="text-xs text-ink-500">Not found this season: {missing.join(', ')}.</p>
      )}

      {slugs.length === 0 && (
        <p className="text-sm text-ink-700">
          Add players above to compare them. For example:{' '}
          <Link className="text-pitch-800 underline" to="/fpl/compare?players=thierno-barry,gonzalo-garcia,charalampos-kostoulas">
            three budget forwards
          </Link>
          .
        </p>
      )}

      {shown.length > 0 && !loading && (
        <div className="overflow-x-auto border border-chalk-300 rounded-lg bg-white" data-testid="compare-table">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                <th className={labelCell}>
                  <span className="sr-only">Measure</span>
                </th>
                {shown.map((p) => (
                  <th key={p.slug} scope="col" className="px-1.5 sm:px-2 py-2 text-right align-top min-w-[5.75rem] sm:min-w-[8rem]">
                    <Link to={`/fpl/players/${p.slug}`} className="block font-semibold text-sm text-ink-900 hover:text-pitch-800">
                      {p.web_name}
                    </Link>
                    <div className="text-[11px] font-normal text-ink-500">
                      {p.team_name} &middot; {p.position} &middot; £{p.price.toFixed(1)}m
                    </div>
                    {p.ownership != null && <div className="text-[11px] font-normal text-ink-500">{p.ownership.toFixed(1)}% owned</div>}
                    {p.news && (
                      <div className="mt-1 text-[11px] font-normal text-loss-700" data-testid="player-news">
                        {p.news}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sectionRow(
                fromGw != null && toGw != null ? `GW${fromGw}–${toGw}` : 'Range',
                'Model projections',
              )}
              {rangeMeasures.map(measureRow)}

              {sectionRow('Minutes, week by week', 'Start chance · expected minutes')}
              {Array.from({ length: weeksInRange }, (_, i) => (fromGw as number) + i).map((gw) => (
                <tr key={`m${gw}`} className="border-t border-chalk-200">
                  <th scope="row" className={labelCell}>GW{gw}</th>
                  {shown.map((p) => {
                    const w = p.weeks.find((x) => x.matchweek === gw);
                    if (!w || w.fixtures.length === 0) {
                      return <td key={p.slug} className="px-2 py-1.5 text-right text-xs text-ink-500">Blank</td>;
                    }
                    return (
                      <td key={p.slug} className="px-2 py-1.5 text-right text-xs font-mono text-ink-900" data-testid="minutes-cell">
                        {w.start == null ? '—' : `${Math.round(w.start * 100)}% · ${w.minutes.toFixed(0)}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-chalk-200">
                <th scope="row" className={labelCell}>Club outlook</th>
                {shown.map((p) => (
                  <td key={p.slug} className="px-2 py-1.5 text-right text-xs">
                    {p.team_slug ? (
                      <Link className="text-pitch-800 underline" to={`/fpl/minutes?team=${p.team_slug}`}>
                        Minutes Outlook
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                ))}
              </tr>

              {sectionRow('Fixtures and points, week by week', 'Opponent · FPL FDR · projected points')}
              {Array.from({ length: weeksInRange }, (_, i) => (fromGw as number) + i).map((gw) => (
                <tr key={`f${gw}`} className="border-t border-chalk-200">
                  <th scope="row" className={labelCell}>GW{gw}</th>
                  {shown.map((p) => {
                    const w = p.weeks.find((x) => x.matchweek === gw);
                    if (!w || w.fixtures.length === 0) {
                      return <td key={p.slug} className="px-2 py-1.5 text-right text-xs text-ink-500">Blank</td>;
                    }
                    return (
                      <td key={p.slug} className="px-2 py-1.5 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {w.fixtures.map((f) => (
                            <span
                              key={f.fixture_id}
                              title={`${f.is_home ? 'v' : 'at'} ${f.opponent_name}${f.fdr != null ? ` \u00b7 FDR ${f.fdr}` : ''}`}
                              className={['rounded px-1 text-[11px] font-semibold', fdrClass(f.fdr)].join(' ')}
                            >
                              {f.opponent_short} {f.is_home ? 'H' : 'A'}
                            </span>
                          ))}
                        </div>
                        <div className="font-mono text-xs text-ink-900 mt-0.5">{w.xpts.toFixed(1)}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {sectionRow('Season so far', 'Official FPL figures')}
              {seasonMeasures.map(measureRow)}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && !loading && (
        <p className="text-xs text-ink-500">
          Projections are estimates from FixtureShark&rsquo;s model{generated ? `, last updated ${ukTime(generated)}` : ''}; the best value in each
          projection row is highlighted. Expected minutes count the chance of starting and of coming off the bench, so a player who might
          not start has fewer. Season figures are FPL&rsquo;s own.
        </p>
      )}
    </div>
  );
}
