// ============================================================================
// src/components/articles/ArticleBarChart.tsx
//
// Horizontal bar chart for the FPL articles: one value per labelled row,
// direct labels on the bars, an optional highlighted row, and a real table
// behind it ("Show as a table"). Hand-drawn SVG like the site's other
// charts; renders on the server.
// ============================================================================

type Row = { label: string; value: number; highlight?: boolean; note?: string };

type Props = {
  /** What to notice, not what the axes are. */
  title: string;
  rows: Row[];
  format: (v: number) => string;
  valueLabel: string;
  takeaway?: string;
};

const W = 340;
const ROW = 24;
const LABEL_W = 118;
const PAD_R = 44;

export default function ArticleBarChart({ title, rows, format, valueLabel, takeaway }: Props) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const H = rows.length * ROW + 4;
  const plot = W - LABEL_W - PAD_R;
  const summary = `${title}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join('; ')}.`;
  return (
    <figure className="rounded-lg border border-chalk-300 bg-white p-3 max-w-xl">
      <figcaption className="font-display uppercase tracking-wide text-sm text-ink-900 mb-2">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={summary}>
        {rows.map((r, i) => {
          const y = i * ROW + 4;
          const w = Math.max(1, (Math.max(0, r.value) / max) * plot);
          return (
            <g key={r.label}>
              <text x={LABEL_W - 6} y={y + ROW / 2 + 1} textAnchor="end" dominantBaseline="middle" className="fill-ink-700 text-[10px]">
                {r.label}
              </text>
              <rect x={LABEL_W} y={y + 3} width={w} height={ROW - 8} rx="2" className={r.highlight ? 'fill-pitch-700' : 'fill-ink-500/35'} />
              <text x={LABEL_W + w + 4} y={y + ROW / 2 + 1} dominantBaseline="middle" className="fill-ink-900 text-[10px] font-mono">
                {format(r.value)}
              </text>
            </g>
          );
        })}
      </svg>
      {takeaway && <p className="text-sm text-ink-700 mt-2">{takeaway}</p>}
      <details className="mt-1">
        <summary className="text-xs text-pitch-800 cursor-pointer underline underline-offset-2">Show as a table</summary>
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left font-mono text-ink-500 font-normal">&nbsp;</th>
              <th scope="col" className="text-right font-mono text-ink-500 font-normal">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="text-left font-normal">{r.label}{r.note ? ` (${r.note})` : ''}</th>
                <td className="text-right font-mono">{format(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
