// ============================================================================
// src/components/finance/FinanceBarChart.tsx
//
// One annual figure over time, drawn as BARS rather than a line: a line
// implies a continuous trend between years, and the brief is explicit that
// no normal trend may be drawn through a non-comparable period. Bars also let
// losses and net liabilities fall naturally below the zero axis.
//
//   * Non-comparable periods are drawn hatched and outlined in amber, marked
//     with a dagger, and explained beneath the chart.
//   * Not-disclosed (null) periods get no bar at all and an explicit "n/d"
//     marker -- never a zero-height bar, which would read as zero.
//   * Every chart has a real table equivalent (in a disclosure widget), and
//     the SVG carries role="img" with a text summary.
//
// Hand-drawn SVG with Tailwind classes, matching the site's other charts --
// no charting library is added.
// ============================================================================

import { NOT_DISCLOSED } from '../../lib/financeFormat';

export type ChartPoint = { label: string; value: number | null; comparable: boolean };

type Props = {
  id: string;
  title: string;
  points: ChartPoint[];
  format: (v: number) => string;
  /** Plain-English label for a value, e.g. "Operating loss £1.3m". */
  describe?: (v: number) => string;
  note?: string;
};

const W = 320;
const H = 150;
const PAD_T = 14;
const PAD_B = 22;

export default function FinanceBarChart({ id, title, points, format, describe, note }: Props) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const hasData = vals.length > 0;
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + ((max - v) / span) * plotH;
  const zeroY = y(0);
  const slot = W / Math.max(1, points.length);
  const barW = Math.min(30, slot * 0.6);
  const anyNonComparable = points.some((p) => !p.comparable);
  const say = (v: number) => (describe ? describe(v) : format(v));

  const summary = hasData
    ? `${title}: ${points.map((p) => `${p.label} ${p.value == null ? NOT_DISCLOSED.toLowerCase() : say(p.value)}${p.comparable ? '' : ' (not comparable)'}`).join('; ')}.`
    : `${title}: not disclosed in any period.`;

  return (
    <figure className="rounded-lg border border-ink-500/20 bg-white/60 p-3">
      <figcaption className="font-display uppercase tracking-wide text-sm text-ink-900 mb-1">{title}</figcaption>
      {hasData ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={summary}>
          <defs>
            <pattern id={`hatch-${id}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" className="stroke-amber-500" strokeWidth="2" />
            </pattern>
          </defs>
          <line x1="0" x2={W} y1={zeroY} y2={zeroY} className="stroke-ink-500/50" strokeWidth="1" />
          {points.map((p, i) => {
            const cx = slot * i + slot / 2;
            if (p.value == null) {
              return (
                <g key={p.label}>
                  <text x={cx} y={zeroY - 4} textAnchor="middle" className="fill-ink-500 text-[9px] font-mono">n/d</text>
                  <text x={cx} y={H - 6} textAnchor="middle" className="fill-ink-700 text-[9px] font-mono">{p.label}</text>
                </g>
              );
            }
            const top = Math.min(y(p.value), zeroY);
            const h = Math.max(1, Math.abs(y(p.value) - zeroY));
            const negative = p.value < 0;
            return (
              <g key={p.label}>
                <rect
                  x={cx - barW / 2}
                  y={top}
                  width={barW}
                  height={h}
                  rx="2"
                  className={p.comparable ? (negative ? 'fill-loss-600' : 'fill-pitch-700') : 'stroke-amber-600'}
                  fill={p.comparable ? undefined : `url(#hatch-${id})`}
                  strokeWidth={p.comparable ? 0 : 1.5}
                  strokeDasharray={p.comparable ? undefined : '3 2'}
                />
                <text x={cx} y={negative ? top + h + 10 : top - 3} textAnchor="middle" className="fill-ink-700 text-[8.5px] font-mono">
                  {format(p.value)}
                </text>
                <text x={cx} y={H - 6} textAnchor="middle" className={`text-[9px] font-mono ${p.comparable ? 'fill-ink-700' : 'fill-amber-600'}`}>
                  {p.label}
                  {p.comparable ? '' : '\u2020'}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="text-sm text-ink-500 py-6 text-center">{NOT_DISCLOSED} in any published period.</p>
      )}
      {anyNonComparable && hasData && (
        <p className="text-[11px] text-amber-600 mt-1">
          <span aria-hidden="true">{'\u2020'} </span>Hatched: not directly comparable with the years either side.
        </p>
      )}
      {note && <p className="text-[11px] text-ink-500 mt-1">{note}</p>}
      <details className="mt-1">
        <summary className="text-xs text-pitch-800 cursor-pointer underline underline-offset-2">Show as a table</summary>
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">{title}, by financial year</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left font-mono text-ink-500 font-normal">Year</th>
              <th scope="col" className="text-right font-mono text-ink-500 font-normal">Value</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <th scope="row" className="text-left font-normal">
                  {p.label}
                  {p.comparable ? '' : ' \u2020 not comparable'}
                </th>
                <td className="text-right font-mono">{p.value == null ? NOT_DISCLOSED : say(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
