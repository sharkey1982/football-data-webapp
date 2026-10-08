// ============================================================================
// src/components/history/LineChart.tsx
//
// A small hand-drawn SVG line chart for the history pages: numbered x values
// (matches played), one or more lines, optional shaded bands (a percentile
// range) and optional dots. No charting library -- recharts was removed for
// its size, and these charts need nothing it offered. Every chart is paired
// with a table or a sentence on the page, so the numbers survive without SVG.
// ============================================================================

export type LinePoint = { x: number; y: number };
export type LineSeries = {
  id: string;
  label: string;
  points: LinePoint[];
  /** Tailwind stroke class, e.g. 'stroke-pitch-700'. */
  strokeClass: string;
  width?: number;
  dashed?: boolean;
  dots?: boolean;
};
export type LineBand = { id: string; label: string; lower: LinePoint[]; upper: LinePoint[]; fillClass: string };

type Props = {
  series: LineSeries[];
  bands?: LineBand[];
  xLabel: string;
  yLabel: string;
  ariaLabel: string;
  yMin?: number;
  yMax?: number;
  /** Draw y upside down (for league positions: 1 at the top). */
  invertY?: boolean;
  height?: number;
  /** Hover text for a dot; defaults to "label: y after x" (matches played). */
  pointTitle?: (s: LineSeries, p: LinePoint) => string;
};

const W = 640;
const PAD = { l: 44, r: 12, t: 12, b: 34 };

function niceStep(range: number): number {
  const raw = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

export default function LineChart({ series, bands = [], xLabel, yLabel, ariaLabel, yMin, yMax, invertY = false, height = 300, pointTitle }: Props) {
  const all = [...series.flatMap((s) => s.points), ...bands.flatMap((b) => [...b.lower, ...b.upper])];
  if (all.length === 0) return null;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const y0 = yMin ?? Math.min(0, ...ys);
  const y1 = yMax ?? Math.max(...ys, y0 + 1);
  const H = height;
  const x = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => {
    const t = (v - y0) / (y1 - y0);
    return invertY ? PAD.t + t * (H - PAD.t - PAD.b) : H - PAD.b - t * (H - PAD.t - PAD.b);
  };
  const path = (pts: LinePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const yStep = niceStep(y1 - y0);
  const yTicks: number[] = [];
  for (let v = Math.ceil(y0 / yStep) * yStep; v <= y1 + 1e-9; v += yStep) yTicks.push(Math.round(v * 100) / 100);
  const xStep = niceStep(x1 - x0);
  const xTicks: number[] = [];
  for (let v = Math.ceil(x0 / xStep) * xStep; v <= x1 + 1e-9; v += xStep) xTicks.push(Math.round(v));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-chalk-300" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" className="fill-ink-500">
            {t}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={`x${t}`} x={x(t)} y={H - PAD.b + 16} textAnchor="middle" fontSize="11" className="fill-ink-500">
          {t}
        </text>
      ))}
      <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" fontSize="11" className="fill-ink-500">
        {xLabel}
      </text>
      <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" fontSize="11" className="fill-ink-500" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>
        {yLabel}
      </text>
      {bands.map((b) => (
        <path
          key={b.id}
          d={`${path(b.upper)} ${[...b.lower].reverse().map((p) => `L${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ')} Z`}
          className={b.fillClass}
          stroke="none"
        >
          <title>{b.label}</title>
        </path>
      ))}
      {series.map((s) => (
        <g key={s.id}>
          <path d={path(s.points)} fill="none" className={s.strokeClass} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? '5 4' : undefined}>
            <title>{s.label}</title>
          </path>
          {s.dots &&
            s.points.map((p) => (
              <circle key={p.x} cx={x(p.x)} cy={y(p.y)} r="3" className={s.strokeClass.replace('stroke-', 'fill-')}>
                <title>{pointTitle ? pointTitle(s, p) : `${s.label}: ${p.y} after ${p.x}`}</title>
              </circle>
            ))}
        </g>
      ))}
    </svg>
  );
}

/** A plain legend matching the chart's classes. */
export function ChartLegend({ items }: { items: { label: string; swatchClass: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className={`inline-block w-5 h-1.5 rounded ${it.swatchClass} ${it.dashed ? 'opacity-70' : ''}`} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
