// ============================================================================
// src/components/TeamHistoryPanel.tsx
//
// A team's league history across every season in the archive: summary,
// finishing position on one scale across all five divisions (the pyramid
// position), season by season, and home v away by season and by month.
// Charts are plain SVG/divs -- no chart library, for bundle size.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  bestAndWorst,
  getTeamMonthProfile,
  getTeamStandings,
  ordinal,
  seasonName,
  summariseHistory,
  venueLine,
  type MonthRow,
  type StandingRow,
  type Venue,
} from '../lib/teamHistoryApi';

const VENUES: { value: Venue; label: string }[] = [
  { value: 'total', label: 'Total' },
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
];

const f1 = (x: number | null) => (x === null ? '\u2013' : x.toFixed(1));
const f2 = (x: number | null) => (x === null ? '\u2013' : x.toFixed(2));

function Toggle({ value, onChange }: { value: Venue; onChange: (v: Venue) => void }) {
  return (
    <div className="inline-flex rounded border border-chalk-300 overflow-hidden text-xs">
      {VENUES.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 ${value === o.value ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white p-3">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="font-mono text-lg text-ink-900">{value}</div>
      {sub && <div className="text-xs text-ink-500">{sub}</div>}
    </div>
  );
}

const finishText = (r: StandingRow) => `${ordinal(r.position)}, ${r.league_name} ${seasonName(r.season_label)}`;

// ---------------------------------------------------------------------------
// Pyramid position chart
// ---------------------------------------------------------------------------

function PyramidChart({ rows }: { rows: StandingRow[] }) {
  // Near-square so it stays legible on a phone; capped width on desktop.
  const W = 420;
  const H = 280;
  const padL = 30;
  const padR = 20;
  const padT = 8;
  const padB = 24;
  // Tier bands from the actual team counts in the seasons shown.
  const bands = useMemo(() => {
    const out: { tier: number; name: string; from: number; to: number }[] = [];
    const sizes = new Map<number, { name: string; size: number }>();
    for (const r of rows) {
      const cur = sizes.get(r.tier);
      if (!cur || r.teams > cur.size) sizes.set(r.tier, { name: r.league_name, size: r.teams });
    }
    const standard: Record<number, number> = { 1: 20, 2: 24, 3: 24, 4: 24, 5: 24 };
    const names: Record<number, string> = { 1: 'Premier League', 2: 'Championship', 3: 'League One', 4: 'League Two', 5: 'National League' };
    let from = 1;
    for (let tier = 1; tier <= Math.max(...rows.map((r) => r.tier)); tier++) {
      const size = standard[tier] ?? sizes.get(tier)?.size ?? 24;
      out.push({ tier, name: sizes.get(tier)?.name ?? names[tier] ?? '', from, to: from + size - 1 });
      from += size;
    }
    return out;
  }, [rows]);
  const maxPos = bands[bands.length - 1]?.to ?? 116;
  const x = (i: number) => padL + (rows.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (rows.length - 1));
  const y = (p: number) => padT + ((p - 1) * (H - padT - padB)) / (maxPos - 1);
  const pts = rows.map((r, i) => `${x(i)},${y(r.pyramid_position)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl h-auto" role="img" aria-label="Finishing position across the league pyramid, by season">
      {bands.map((b, i) => (
        <g key={b.tier}>
          <rect x={padL} y={y(b.from) - 1} width={W - padL - padR} height={y(b.to) - y(b.from) + 2} className={i % 2 ? 'fill-chalk-100' : 'fill-chalk-200'} />
          <text x={padL + 4} y={y(b.from) + 10} className="fill-ink-500" fontSize="11">
            {b.name}
          </text>
          <text x={padL - 4} y={y(b.from) + 3} textAnchor="end" className="fill-ink-500" fontSize="11">
            {b.from}
          </text>
        </g>
      ))}
      <polyline points={pts} fill="none" className="stroke-pitch-700" strokeWidth="2" />
      {rows.map((r, i) => (
        <g key={r.season_id}>
          <circle
            cx={x(i)}
            cy={y(r.pyramid_position)}
            r="4"
            className={r.is_final ? 'fill-pitch-700' : 'fill-white stroke-amber-600'}
            strokeWidth={r.is_final ? 0 : 2}
            data-testid="pyramid-point"
          >
            <title>
              {seasonName(r.season_label)}: {ordinal(r.position)} in the {r.league_name}, {ordinal(r.pyramid_position)} overall
              {r.is_final ? '' : ' (so far)'}
            </title>
          </circle>
          {(rows.length <= 7 || i % 2 === 0 || i === rows.length - 1) && (
            <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-500" fontSize="11">
              {r.season_label.slice(0, 2)}/{r.season_label.slice(2)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Paired home/away bars (points per game, 0-3)
// ---------------------------------------------------------------------------

function PairBars({ items }: { items: { key: string; label: string; home: number | null; away: number | null; note?: string }[] }) {
  const w = (v: number | null) => `${v === null ? 0 : Math.max(0, Math.min(100, (v / 3) * 100))}%`;
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.key} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-xs" data-testid="pair-row">
          <div className="text-ink-700">{it.label}</div>
          <div className="space-y-0.5">
            <div className="h-2 bg-chalk-200 rounded">
              <div className="h-2 bg-pitch-700 rounded" style={{ width: w(it.home) }} />
            </div>
            <div className="h-2 bg-chalk-200 rounded">
              <div className="h-2 bg-amber-500 rounded" style={{ width: w(it.away) }} />
            </div>
          </div>
          <div className="font-mono text-right text-ink-700 leading-tight">
            {f2(it.home)}
            <br />
            {f2(it.away)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Season table
// ---------------------------------------------------------------------------

type SortKey = 'season' | 'pyramid' | 'played' | 'won' | 'drawn' | 'lost' | 'gf' | 'ga' | 'gd' | 'cs' | 'pts' | 'ppg';

function SeasonTable({ rows, venue }: { rows: StandingRow[]; venue: Venue }) {
  const [sortKey, setSortKey] = useState<SortKey>('season');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const lines = useMemo(() => {
    const out = rows.map((r) => {
      const l = venueLine(r, venue);
      return { r, l, gd: l.goalsFor - l.goalsAgainst, ppg: l.played ? l.points / l.played : 0 };
    });
    const val = (o: (typeof out)[number]): number => {
      switch (sortKey) {
        case 'season': return o.r.season_id;
        case 'pyramid': return o.r.pyramid_position;
        case 'played': return o.l.played;
        case 'won': return o.l.won;
        case 'drawn': return o.l.drawn;
        case 'lost': return o.l.lost;
        case 'gf': return o.l.goalsFor;
        case 'ga': return o.l.goalsAgainst;
        case 'gd': return o.gd;
        case 'cs': return o.l.cleanSheets;
        case 'pts': return o.l.points;
        case 'ppg': return o.ppg;
      }
    };
    out.sort((a, b) => (dir === 'asc' ? val(a) - val(b) : val(b) - val(a)));
    return out;
  }, [rows, venue, sortKey, dir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setDir(k === 'pyramid' || k === 'lost' || k === 'ga' ? 'asc' : 'desc');
    }
  };
  const cols: { key: SortKey; label: string; hideMobile?: boolean }[] = [
    { key: 'pyramid', label: 'Pos' },
    { key: 'played', label: 'P' },
    { key: 'won', label: 'W', hideMobile: true },
    { key: 'drawn', label: 'D', hideMobile: true },
    { key: 'lost', label: 'L', hideMobile: true },
    { key: 'gf', label: 'GF' },
    { key: 'ga', label: 'GA' },
    { key: 'gd', label: 'GD', hideMobile: true },
    { key: 'cs', label: 'CS', hideMobile: true },
    { key: 'pts', label: 'Pts' },
    { key: 'ppg', label: 'PPG', hideMobile: true },
  ];
  const Th = ({ k, label, cls = '' }: { k: SortKey; label: string; cls?: string }) => (
    <th aria-sort={sortKey === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-2 py-2 font-medium ${cls}`}>
      <button type="button" onClick={() => onSort(k)} className="whitespace-nowrap">
        {label}
        {sortKey === k && <span className="ml-1">{dir === 'asc' ? '\u25b2' : '\u25bc'}</span>}
      </button>
    </th>
  );

  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-x-auto">
      <table className="w-full text-sm" aria-label="Season by season">
        <thead className="bg-chalk-100 text-ink-700">
          <tr>
            <Th k="season" label="Season" cls="text-left" />
            <th className="px-2 py-2 font-medium text-left hidden sm:table-cell">Div</th>
            {cols.map((c) => (
              <Th key={c.key} k={c.key} label={c.label} cls={`text-right ${c.hideMobile ? 'hidden sm:table-cell' : ''}`} />
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map(({ r, l, gd, ppg }) => (
            <tr key={r.season_id} className="border-t border-chalk-200">
              <td className="px-2 py-1.5 whitespace-nowrap text-ink-900">
                {seasonName(r.season_label)}
                {!r.is_final && <span className="text-ink-500"> (so far)</span>}
                <span className="sm:hidden block font-mono text-xs text-pitch-700">{r.league_code}</span>
              </td>
              <td className="px-2 py-1.5 font-mono text-xs text-pitch-700 hidden sm:table-cell">{r.league_code}</td>
              <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap" title={`${ordinal(r.pyramid_position)} across the pyramid`}>
                {r.position}
                <span className="text-ink-500">/{r.teams}</span>
                {r.curtailed && <sup title="Curtailed season, ranked on points per game">*</sup>}
              </td>
              <td className="px-2 py-1.5 text-right font-mono">{l.played}</td>
              <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">{l.won}</td>
              <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">{l.drawn}</td>
              <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">{l.lost}</td>
              <td className="px-2 py-1.5 text-right font-mono">{l.goalsFor}</td>
              <td className="px-2 py-1.5 text-right font-mono">{l.goalsAgainst}</td>
              <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">{gd > 0 ? `+${gd}` : gd}</td>
              <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">{l.cleanSheets}</td>
              <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">
                {l.points}
                {venue === 'total' && r.deduction !== 0 && (
                  <span className="text-loss-700" title="Points deducted">
                    {' '}({r.deduction})
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">{ppg.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function TeamHistoryPanel({ teamId, teamName }: { teamId: number; teamName: string }) {
  const [rows, setRows] = useState<StandingRow[] | null>(null);
  const [months, setMonths] = useState<MonthRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [venue, setVenue] = useState<Venue>('total');

  useEffect(() => {
    let live = true;
    setRows(null);
    setMonths(null);
    setError(null);
    Promise.all([getTeamStandings(teamId), getTeamMonthProfile(teamId)])
      .then(([s, m]) => {
        if (!live) return;
        setRows(s);
        setMonths(m);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [teamId]);

  const summary = useMemo(() => (rows ? summariseHistory(rows, venue) : null), [rows, venue]);
  const extremes = useMemo(() => (rows ? bestAndWorst(rows) : { best: null, worst: null }), [rows]);
  const monthItems = useMemo(() => {
    if (!months) return [];
    const order: number[] = [];
    for (const m of months) if (!order.includes(m.month_num)) order.push(m.month_num);
    return order.map((mo) => {
      const h = months.find((m) => m.month_num === mo && m.venue === 'home');
      const a = months.find((m) => m.month_num === mo && m.venue === 'away');
      return { key: String(mo), label: (h ?? a)!.month_label, home: h ? h.ppg : null, away: a ? a.ppg : null };
    });
  }, [months]);

  if (error) return <p className="text-sm text-loss-700">{error}</p>;
  if (!rows || !summary) return <p className="text-ink-500 font-mono text-sm">Loading history&hellip;</p>;
  if (rows.length === 0) return null;

  const seasonItems = rows.map((r) => ({
    key: String(r.season_id),
    label: `${r.season_label.slice(0, 2)}/${r.season_label.slice(2)} ${r.league_code}`,
    home: r.home_played ? r.home_points / r.home_played : null,
    away: r.away_played ? r.away_points / r.away_played : null,
  }));

  return (
    <section className="space-y-4" aria-label={`${teamName} league history`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
          League history <span className="text-ink-500 text-sm normal-case tracking-normal">{summary.seasons} seasons</span>
        </h2>
        <Toggle value={venue} onChange={setVenue} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Record" value={`${summary.won}-${summary.drawn}-${summary.lost}`} sub={`${summary.played} played`} />
        <Card label="Points per game" value={f2(summary.ppg)} sub={`${summary.points} points`} />
        <Card label="Goals for" value={String(summary.goalsFor)} sub={`${f2(summary.gfPerGame)} per game`} />
        <Card label="Goals against" value={String(summary.goalsAgainst)} sub={`${f2(summary.gaPerGame)} per game`} />
        <Card label="Clean sheets" value={String(summary.cleanSheets)} sub={`${f1(summary.cleanSheetPct)}% of games`} />
        <Card label="Divisions" value={String(summary.divisions.length)} sub={summary.divisions.join(', ')} />
        {extremes.best && <Card label="Best finish" value={`${ordinal(extremes.best.pyramid_position)} overall`} sub={finishText(extremes.best)} />}
        {extremes.worst && <Card label="Lowest finish" value={`${ordinal(extremes.worst.pyramid_position)} overall`} sub={finishText(extremes.worst)} />}
      </div>

      <div className="border border-chalk-300 rounded-lg bg-white p-3">
        <h3 className="text-sm text-ink-700 mb-2">Finishing position across the pyramid</h3>
        <PyramidChart rows={rows} />
      </div>

      <SeasonTable rows={rows} venue={venue} />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-chalk-300 rounded-lg bg-white p-3">
          <h3 className="text-sm text-ink-700 mb-1">Home v away by season</h3>
          <p className="text-xs text-ink-500 mb-2">
            Points per game: <span className="text-pitch-700">home</span>, <span className="text-amber-600">away</span>
          </p>
          <PairBars items={seasonItems} />
        </div>
        <div className="border border-chalk-300 rounded-lg bg-white p-3">
          <h3 className="text-sm text-ink-700 mb-1">Home v away by month</h3>
          <p className="text-xs text-ink-500 mb-2">
            Points per game across all seasons: <span className="text-pitch-700">home</span>, <span className="text-amber-600">away</span>
          </p>
          <PairBars items={monthItems} />
        </div>
      </div>

      <p className="text-xs text-ink-500">
        League matches only. Overall position counts every club above: 1st&ndash;20th Premier League, then the Championship from
        21st, and so on to the National League. * Curtailed season, ranked on points per game. Points deductions are applied;
        none are recorded yet for the National League.
      </p>
    </section>
  );
}
