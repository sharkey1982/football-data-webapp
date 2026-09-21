// ============================================================================
// src/components/Timelapse.tsx
//
// A reusable horizontal bar "race": named series of numbers, one value per
// frame, ranked each frame. Knows nothing about football, finance or FPL --
// callers pass series and frame labels (the league table's points race; later
// FPL scorers, seasons...). Each series is a stable element whose rank
// position and bar width animate, so the eye can follow it overtaking; the
// scale is fixed across all frames so growth shows as growth. Play/Pause and
// a slider; with "reduce motion", instant steps. Null values drop out of a
// frame rather than showing as zero. Every value is also in a table under
// "Show as a table".
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export type TimelapseSeries = { id: string | number; name: string; values: (number | null)[]; href?: string };

type Props = {
  series: TimelapseSeries[];
  frameLabel: (i: number) => string;
  /** What the numbers are, for screen readers and the table: "Points". */
  measure: string;
  valueLabel?: (v: number) => string;
  top?: number;
  stepMs?: number;
};

const ROW = 26;

export default function Timelapse({ series, frameLabel, measure, valueLabel = (v) => String(Math.round(v)), top = 10, stepMs = 700 }: Props) {
  const frames = Math.max(0, ...series.map((s) => s.values.length));
  const [idx, setIdx] = useState(Math.max(0, frames - 1));
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (idx >= frames - 1) setPlaying(false);
      else setIdx((i) => i + 1);
    }, stepMs);
    return () => clearTimeout(t);
  }, [playing, idx, frames, stepMs]);

  if (!frames) return null;
  const i = Math.min(idx, frames - 1);
  const ranked = series
    .map((s) => ({ s, v: s.values[i] }))
    .filter((r): r is { s: TimelapseSeries; v: number } => r.v != null)
    .sort((a, b) => b.v - a.v || a.s.name.localeCompare(b.s.name))
    .slice(0, top);
  const rank = new Map(ranked.map((r, k) => [r.s.id, k]));
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const shown = Math.min(top, series.length);

  const play = () => {
    if (playing) return setPlaying(false);
    if (i >= frames - 1) setIdx(0);
    setPlaying(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={play} className="rounded bg-amber-500 px-3 py-1 text-sm font-semibold text-ink-900 hover:bg-amber-400">
          {playing ? 'Pause' : i >= frames - 1 ? 'Play from the start' : 'Play'}
        </button>
        <input type="range" min={0} max={frames - 1} value={i} aria-label="Frame"
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="flex-1 accent-pitch-700" />
      </div>
      <p className="font-display text-2xl text-ink-900" aria-live="polite">{frameLabel(i)}</p>
      <div role="list" aria-label={`${measure}, ${frameLabel(i)}`} className="relative" style={{ height: shown * ROW }}>
        {series.map((s) => {
          const k = rank.get(s.id);
          const v = k == null ? null : ranked[k].v;
          const name = s.href ? <Link to={s.href} className="truncate text-ink-900 hover:text-pitch-800" tabIndex={k == null ? -1 : 0}>{s.name}</Link> : <span className="truncate text-ink-900">{s.name}</span>;
          return (
            <div key={s.id} role="listitem" aria-hidden={k == null}
              className="absolute inset-x-0 grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-sm transition-[top,opacity] duration-500 motion-reduce:transition-none"
              style={{ top: (k ?? shown) * ROW, height: ROW - 4, opacity: k == null ? 0 : 1 }}>
              {name}
              <div className="relative h-full">
                <div className={`absolute inset-y-0 left-0 rounded transition-[width] duration-500 motion-reduce:transition-none ${k === 0 ? 'bg-pitch-700' : 'bg-pitch-700/60'}`}
                  style={{ width: `${v == null ? 0 : (Math.max(0, v) / max) * 100}%` }} />
              </div>
              <span className="font-mono text-xs text-ink-700 whitespace-nowrap">{v == null ? '' : valueLabel(v)}</span>
            </div>
          );
        })}
      </div>
      <details>
        <summary className="text-xs text-pitch-800 cursor-pointer underline underline-offset-2">Show as a table</summary>
        <div className="overflow-x-auto mt-2">
          <table className="min-w-full text-xs">
            <caption className="sr-only">{measure} at every step</caption>
            <thead><tr><th scope="col" className="text-left font-normal text-ink-500 pr-3">Name</th>
              {Array.from({ length: frames }, (_, f) => <th key={f} scope="col" className="text-right font-normal text-ink-500 px-1.5">{f + 1}</th>)}</tr></thead>
            <tbody>
              {[...series].sort((a, b) => (b.values[frames - 1] ?? -1) - (a.values[frames - 1] ?? -1)).map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="text-left font-normal pr-3 whitespace-nowrap">{s.name}</th>
                  {Array.from({ length: frames }, (_, f) => <td key={f} className="text-right font-mono px-1.5">{s.values[f] == null ? '\u2014' : valueLabel(s.values[f]!)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
