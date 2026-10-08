// ============================================================================
// src/components/articles/DeltaBarChart.tsx
//
// Points gained or lost against a reference (zero), each bar split into two
// named parts (e.g. ordinary points and captaincy). Horizontal, so long
// labels fit on a phone; parts are two neutrals of different lightness with
// a 2px gap, named in the legend and in the table behind the chart, so
// nothing depends on colour alone. Renders on the server.
// ============================================================================

type Row = { label: string; note?: string; a: number; b: number };

type Props = {
  title: string;
  rows: Row[];
  aLabel: string;
  bLabel: string;
  takeaway?: string;
};

const W = 340;
const ROW = 34;
const LABEL_W = 150;
const PAD_R = 44;
const fmt = (v: number) => (v > 0.005 ? `+${v.toFixed(1)}` : v < -0.005 ? `−${Math.abs(v).toFixed(1)}` : '0.0');

export default function DeltaBarChart({ title, rows, aLabel, bLabel, takeaway }: Props) {
  const min = Math.min(0, ...rows.map((r) => Math.min(r.a, 0) + Math.min(r.b, 0)));
  const max = Math.max(0, ...rows.map((r) => Math.max(r.a, 0) + Math.max(r.b, 0)));
  const span = max - min || 1;
  const plot = W - LABEL_W - PAD_R;
  const x = (v: number) => LABEL_W + ((v - min) / span) * plot;
  const H = rows.length * ROW + 6;
  const summary = `${title}: ${rows.map((r) => `${r.label} ${fmt(r.a + r.b)} (${aLabel} ${fmt(r.a)}, ${bLabel} ${fmt(r.b)})`).join('; ')}.`;
  return (
    <figure className="rounded-lg border border-chalk-300 bg-white p-3 max-w-xl">
      <figcaption className="font-display uppercase tracking-wide text-sm text-ink-900 mb-1">{title}</figcaption>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700 mb-1" aria-hidden="true">
        <li className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-ink-500/45" />{aLabel}</li>
        <li className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-ink-900" />{bLabel}</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={summary}>
        <line x1={x(0)} x2={x(0)} y1={0} y2={H} className="stroke-ink-500/60" strokeWidth="1" />
        {rows.map((r, i) => {
          const y = i * ROW + 6;
          // Parts stack outward from zero in the direction of their sign.
          const parts: { v: number; cls: string; name: string }[] = [
            { v: r.a, cls: 'fill-ink-500/45', name: aLabel },
            { v: r.b, cls: 'fill-ink-900', name: bLabel },
          ];
          let neg = 0, pos = 0;
          const total = r.a + r.b;
          return (
            <g key={r.label}>
              <text x={LABEL_W - 6} y={y + 11} textAnchor="end" className="fill-ink-900 text-[11px]">{r.label}</text>
              {r.note && <text x={LABEL_W - 6} y={y + 23} textAnchor="end" className="fill-ink-500 text-[9.5px]">{r.note}</text>}
              {parts.map((p) => {
                if (Math.abs(p.v) < 0.005) return null;
                const from = p.v < 0 ? neg : pos;
                const to = from + p.v;
                if (p.v < 0) neg = to; else pos = to;
                const x0 = Math.min(x(from), x(to)), w = Math.abs(x(to) - x(from));
                return (
                  <rect key={p.name} x={x0 + (p.v < 0 ? 0 : 1)} y={y + 2} width={Math.max(1, w - 1)} height={ROW - 14} rx="2" className={p.cls}>
                    <title>{`${r.label}: ${p.name} ${fmt(p.v)}`}</title>
                  </rect>
                );
              })}
              <text x={(total < 0 ? x(0) : x(pos)) + 4} y={y + 15} textAnchor="start" className="fill-ink-900 text-[11px] font-mono">
                {Math.abs(total) < 0.005 ? '' : fmt(total)}
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
              <th scope="col" className="text-right font-mono text-ink-500 font-normal">{aLabel}</th>
              <th scope="col" className="text-right font-mono text-ink-500 font-normal">{bLabel}</th>
              <th scope="col" className="text-right font-mono text-ink-500 font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="text-left font-normal">{r.label}</th>
                <td className="text-right font-mono">{fmt(r.a)}</td>
                <td className="text-right font-mono">{fmt(r.b)}</td>
                <td className="text-right font-mono">{fmt(r.a + r.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
