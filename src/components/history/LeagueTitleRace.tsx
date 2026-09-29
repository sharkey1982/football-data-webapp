// ============================================================================
// src/components/history/LeagueTitleRace.tsx
//
// Title-race summary for a league page: headline figures, every champion's
// points match by match (one season highlighted), the spread of champions'
// points, most titles, recent champions and the highest totals. The lists
// render on the server from the index data; the chart loads in the browser.
// ============================================================================

import { useMemo, useState } from 'react';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { Link } from 'react-router-dom';
import LineChart, { ChartLegend, type LineSeries } from './LineChart';
import type { LeagueIndexData } from '../../lib/leagueSeasonApi';
import { buildTitleRace, loadChampionPaths, pointsBins, type ChampionPath, type TitleRaceSummary } from '../../lib/titleRace';

function Tile({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white px-3 py-2">
      <p className="font-display text-2xl text-ink-900 leading-tight">{value}</p>
      <p className="text-xs text-ink-700">{label}</p>
      {detail && <p className="text-xs text-ink-500">{detail}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-chalk-300 rounded-lg bg-white p-3">
      <h3 className="font-display uppercase tracking-wide text-sm text-ink-900 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function SpreadChart({ points, mean }: { points: number[]; mean: number | null }) {
  const bins = pointsBins(points);
  if (!bins.length) return null;
  const W = 300, H = 120, pad = { l: 22, r: 6, t: 14, b: 22 };
  const max = Math.max(...bins.map((b) => b.count));
  const bw = (W - pad.l - pad.r) / bins.length;
  const lo = bins[0].from;
  const hi = bins[bins.length - 1].to + 1;
  const xOf = (v: number) => pad.l + ((v - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const yOf = (c: number) => H - pad.b - (c / max) * (H - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Champions' final points, in 5-point bands">
      {bins.map((b, i) => (
        <g key={b.from}>
          <rect x={pad.l + i * bw + 1} y={yOf(b.count)} width={bw - 2} height={H - pad.b - yOf(b.count)} className="fill-pitch-700">
            <title>{`${b.from}–${b.to} points: ${b.count} ${b.count === 1 ? 'season' : 'seasons'}`}</title>
          </rect>
          <text x={pad.l + i * bw + bw / 2} y={H - pad.b + 12} textAnchor="middle" fontSize="9" className="fill-ink-500">{b.from}</text>
          {b.count > 0 && <text x={pad.l + i * bw + bw / 2} y={yOf(b.count) - 2} textAnchor="middle" fontSize="9" className="fill-ink-700">{b.count}</text>}
        </g>
      ))}
      {mean != null && (
        <g>
          <line x1={xOf(mean)} x2={xOf(mean)} y1={pad.t - 4} y2={H - pad.b} className="stroke-amber-600" strokeWidth="1.5" strokeDasharray="3 3">
            <title>{`Average ${Math.round(mean)}`}</title>
          </line>
        </g>
      )}
      <text x={(pad.l + W - pad.r) / 2} y={H - 2} textAnchor="middle" fontSize="9" className="fill-ink-500">Points</text>
    </svg>
  );
}

function PathsChart({ data, s }: { data: LeagueIndexData; s: TitleRaceSummary }) {
  const { data: loaded, failed } = useKeyedFetch(`title-race:${data.league.slug}`, () => loadChampionPaths(data, s));
  const paths = useMemo(() => (loaded ? loaded.filter((x) => x.points.length > 0) : null), [loaded]);
  const defaultYear = s.current?.startYear ?? s.latest?.startYear ?? null;
  const [highlight, setHighlight] = useState<number | null>(defaultYear);

  const view = useMemo(() => {
    if (!paths?.length) return null;
    const finals = paths.filter((p) => p.final);
    const record = finals.reduce<ChampionPath | null>((best, p) => (!best || p.points[p.points.length - 1].y > best.points[best.points.length - 1].y ? p : best), null);
    const hi = paths.find((p) => p.startYear === highlight) ?? null;
    const series: LineSeries[] = [
      ...paths
        .filter((p) => p !== hi && p !== record)
        .map((p) => ({ id: `s${p.seasonId}`, label: `${p.team} ${p.season}: ${p.points[p.points.length - 1].y} points`, points: p.points, strokeClass: 'stroke-ink-500/25', width: 1.2 })),
      ...(record && record !== hi
        ? [{ id: 'record', label: `${record.team} ${record.season}: ${record.points[record.points.length - 1].y} points (record)`, points: record.points, strokeClass: 'stroke-cup-600', width: 2 }]
        : []),
      ...(hi ? [{ id: 'hi', label: `${hi.team} ${hi.season}: ${hi.points[hi.points.length - 1].y} points`, points: hi.points, strokeClass: 'stroke-amber-600', width: 3 }] : []),
    ];
    return { series, record, hi };
  }, [paths, highlight]);

  if (failed) return <p className="text-sm text-ink-700">The chart is unavailable right now.</p>;
  if (!paths) return <p className="text-ink-500 font-mono text-sm">Loading chart&hellip;</p>;
  if (!view) return null;
  const options = [...paths].sort((a, b) => b.startYear - a.startYear);
  const last = (p: ChampionPath) => p.points[p.points.length - 1];

  return (
    <div className="space-y-2">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Highlight</span>
        <select value={highlight ?? ''} onChange={(e) => setHighlight(Number(e.target.value))} className="w-full sm:w-auto min-w-0 max-w-full border border-chalk-300 rounded px-2 py-1 text-sm bg-white">
          {options.map((p) => (
            <option key={p.seasonId} value={p.startYear}>
              {`${p.season} ${p.team} (${last(p).y}${p.final ? '' : ` after ${last(p).x}, leading`})`}
            </option>
          ))}
        </select>
      </label>
      {view.hi && (
        <p className="text-sm text-ink-900" data-testid="title-race-highlight">
          {view.hi.final
            ? `${view.hi.team} won ${view.hi.season} with ${last(view.hi).y} points.`
            : `${view.hi.team} lead ${view.hi.season} with ${last(view.hi).y} points after ${last(view.hi).x} matches.`}
          {view.record && view.record !== view.hi && ` The record is ${view.record.team}’s ${last(view.record).y} in ${view.record.season}.`}
        </p>
      )}
      <div className="max-w-3xl">
      <LineChart
        ariaLabel={`Every ${data.league.name} champion's points after each match`}
        xLabel="Matches played"
        yLabel="Points"
        yMin={0}
        series={view.series}
        height={320}
      />
      </div>
      <ChartLegend
        items={[
          ...(view.hi ? [{ label: `${view.hi.team} ${view.hi.season}`, swatchClass: 'bg-amber-600' }] : []),
          ...(view.record && view.record !== view.hi ? [{ label: `Record: ${view.record.team} ${view.record.season}`, swatchClass: 'bg-cup-600' }] : []),
          { label: 'Other champions', swatchClass: 'bg-ink-500/30' },
        ]}
      />
    </div>
  );
}

export default function LeagueTitleRace({ data }: { data: LeagueIndexData }) {
  const s = useMemo(() => buildTitleRace(data), [data]);
  if (!s) return null;
  const top = s.titles[0];
  const maxTitles = top?.titles ?? 1;
  const topTied = s.titles.filter((t) => t.titles === top?.titles);

  return (
    <section className="space-y-4" data-testid="title-race">
      <h2 className="font-display uppercase tracking-wide text-xl text-ink-900">Title race history</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile value={String(s.seasons)} label="Seasons" detail={`${s.firstSeason} – ${s.lastSeason}`} />
        {top && <Tile value={String(top.titles)} label="Most titles" detail={topTied.map((t) => t.team).join(', ')} />}
        {s.latest && <Tile value={String(s.latest.points)} label="Latest champions" detail={`${s.latest.team} (${s.latest.season})`} />}
        {s.current ? (
          <Tile value={String(s.current.points)} label="Leading now" detail={`${s.current.leader} (${s.current.season})`} />
        ) : (
          s.highest[0] && <Tile value={String(s.highest[0].points)} label="Best season" detail={`${s.highest[0].team} (${s.highest[0].season})`} />
        )}
      </div>

      <Card title="Champions’ points, match by match">
        <PathsChart data={data} s={s} />
        {s.excluded.seasons > 0 && (
          <p className="text-xs text-ink-500 mt-2">
            {`${s.games}-game seasons only: ${s.excluded.seasons} ${s.excluded.seasons === 1 ? 'season' : 'seasons'} of ${s.excluded.games.join(' or ')} games left out.`}
          </p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Champions’ final points">
          <SpreadChart points={s.spread.points} mean={s.spread.mean} />
          <p className="text-xs text-ink-500 mt-1">
            {`${s.spread.points.length} ${s.games}-game seasons.${s.spread.mean != null ? ` Average ${Math.round(s.spread.mean)} (dashed line)` : ''}${s.spread.median != null ? `, median ${s.spread.median}` : ''}.`}
          </p>
        </Card>

        <Card title="Most titles">
          <ul className="space-y-1.5">
            {s.titles.slice(0, 6).map((t) => (
              <li key={t.team} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{t.team}</span>
                  <span className="font-mono text-xs tabular-nums">{t.titles}</span>
                </div>
                <div className="h-1.5 bg-chalk-200 rounded">
                  <div className="h-1.5 bg-pitch-700 rounded" style={{ width: `${(t.titles / maxTitles) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {s.titles.length > 6 && <p className="text-xs text-ink-500 mt-2">{`${s.titles.length} different champions.`}</p>}
        </Card>

        <Card title="Latest champions">
          <table className="w-full text-sm">
            <tbody>
              {s.recent.map((r) => (
                <tr key={r.startYear}>
                  <td className="py-0.5 pr-2 font-mono text-xs whitespace-nowrap text-ink-500">{r.season}</td>
                  <td className="py-0.5 pr-2">{r.team}</td>
                  <td className="py-0.5 text-right font-mono text-xs tabular-nums">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Highest totals">
          <table className="w-full text-sm">
            <tbody>
              {s.highest.map((r, i) => (
                <tr key={r.startYear}>
                  <td className="py-0.5 pr-2 font-mono text-xs text-ink-500">{i + 1}</td>
                  <td className="py-0.5 pr-2">
                    {r.team} <span className="text-xs text-ink-500">{r.season}</span>
                  </td>
                  <td className="py-0.5 text-right font-mono text-xs tabular-nums" title={`${r.games} games`}>
                    {r.points}
                    {r.games !== s.games && <span className="text-ink-500">{` (${r.games} games)`}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-500 mt-2">
            Ranked by points per game.{' '}
            <Link to={`/football/records/${data.league.slug}`} className="underline underline-offset-2">More in the Record Book</Link>
          </p>
        </Card>
      </div>
    </section>
  );
}
