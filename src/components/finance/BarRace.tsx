// ============================================================================
// src/components/finance/BarRace.tsx
//
// A horizontal bar "race": one measure, year by year, clubs reordering as
// they overtake each other. Each club is a stable element whose vertical
// position (its rank) and bar width animate, so the eye can follow a club
// rather than watch a list jump. The scale is fixed across ALL years, so
// growth shows as growth. Play/Pause and a slider to scrub; with "reduce
// motion" switched on, changes step instantly. Undisclosed values drop out of
// that year's frame rather than showing as zero. A table of every value sits
// under "Show as a table".
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { financialYears, raceFrame, raceMax, RACE_METRICS, type ComparisonClub, type RaceMetric, money } from '../../lib/financeCompare';
import { formatMoneyShort } from '../../lib/financeFormat';

const ROW = 26;

export default function BarRace({ clubs }: { clubs: ComparisonClub[] }) {
  const years = financialYears(clubs).slice().reverse(); // oldest first
  const [metric, setMetric] = useState<RaceMetric>('revenue_total');
  const [idx, setIdx] = useState(years.length - 1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (idx >= years.length - 1) setPlaying(false);
      else setIdx((i) => i + 1);
    }, 1400);
    return () => clearTimeout(t);
  }, [playing, idx, years.length]);

  if (!years.length) return null;
  const year = years[Math.min(idx, years.length - 1)];
  const frame = raceFrame(clubs, metric, year);
  const rank = new Map(frame.map((r, i) => [r.club.team.team_id, i]));
  const max = raceMax(clubs, metric);
  const label = RACE_METRICS.find((m) => m.key === metric)!.label;

  const play = () => {
    if (playing) return setPlaying(false);
    if (idx >= years.length - 1) setIdx(0);
    setPlaying(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {RACE_METRICS.map((m) => (
          <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}
            className={['text-sm rounded px-3 py-1 border', metric === m.key ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200'].join(' ')}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={play} className="rounded bg-amber-500 px-3 py-1 text-sm font-semibold text-ink-900 hover:bg-amber-400">
          {playing ? 'Pause' : idx >= years.length - 1 ? 'Play from the start' : 'Play'}
        </button>
        <input type="range" min={0} max={years.length - 1} value={idx} aria-label="Year"
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="flex-1 accent-pitch-700" />
        <span className="font-display text-2xl text-ink-900 tabular-nums" aria-live="polite">FY{year}</span>
      </div>
      <div role="list" aria-label={`${label} by club, FY${year}`} className="relative" style={{ height: clubs.length * ROW }}>
        {clubs.map((c) => {
          const r = rank.get(c.team.team_id);
          const row = r == null ? null : frame[r];
          return (
            <div key={c.team.team_id} role="listitem" aria-hidden={r == null}
              className="absolute inset-x-0 grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-sm transition-[top,opacity] duration-700 motion-reduce:transition-none"
              style={{ top: (r ?? clubs.length) * ROW, height: ROW - 4, opacity: r == null ? 0 : 1 }}>
              <Link to={`/football/teams/${c.team.slug}/finances`} className="truncate text-ink-900 hover:text-pitch-800" tabIndex={r == null ? -1 : 0}>
                {c.team.display_name}
              </Link>
              <div className="relative h-full">
                <div className={`absolute inset-y-0 left-0 rounded transition-[width] duration-700 motion-reduce:transition-none ${row && !row.comparable ? 'bg-pitch-700/50' : 'bg-pitch-700'}`}
                  style={{ width: `${row ? (row.v / max) * 100 : 0}%` }} />
              </div>
              <span className="font-mono text-xs text-ink-700 whitespace-nowrap">{row ? `${formatMoneyShort(row.v)}${row.comparable ? '' : ' †'}` : ''}</span>
            </div>
          );
        })}
      </div>
      {frame.some((r) => !r.comparable) && <p className="text-xs text-ink-500">† not directly comparable with the year before.</p>}
      <details>
        <summary className="text-xs text-pitch-800 cursor-pointer underline underline-offset-2">Show as a table</summary>
        <div className="overflow-x-auto mt-2">
          <table className="min-w-full text-xs">
            <caption className="sr-only">{label} by club and financial year</caption>
            <thead><tr><th scope="col" className="text-left font-normal text-ink-500 pr-3">Club</th>
              {years.map((y) => <th key={y} scope="col" className="text-right font-normal text-ink-500 px-2">FY{y}</th>)}</tr></thead>
            <tbody>
              {clubs.map((c) => (
                <tr key={c.team.team_id}>
                  <th scope="row" className="text-left font-normal pr-3 whitespace-nowrap">{c.team.display_name}</th>
                  {years.map((y) => { const p = c.periods.find((x) => x.period_end.startsWith(y)); const v = p ? money(p, metric) : null;
                    return <td key={y} className="text-right font-mono px-2 whitespace-nowrap">{v == null ? (p ? 'n/d' : '\u2014') : formatMoneyShort(v)}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
