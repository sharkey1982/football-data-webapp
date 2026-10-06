// ============================================================================
// src/components/tennis/TitlesByLevel.tsx
//
// Player page: titles by tournament level as a donut (Chris, 6 Oct 2026,
// after the BBC's "Djokovic titles by level"). The total sits in the hole.
// Each level's count and name are in the legend beside it, so colour is never
// the only cue. The "By level" table next to it is the table view.
//
// Colours: the dataviz reference categorical order, slots 1-6 in level order.
// Validated on the light surface: CVD worst adjacent ΔE 9.1, normal-vision
// 19.6. The contrast WARN for yellow, aqua and pink is covered by the labelled
// legend and the table.
// ============================================================================

import { LEVEL_LABEL, type Level } from '../../lib/tennisStats';

const ORDER: Level[] = ['Grand Slam', 'Finals', '1000', 'Premier', '500', '250'];
const COLOUR: Record<Level, string> = {
  'Grand Slam': '#2a78d6',
  Finals: '#eb6834',
  '1000': '#1baf7a',
  Premier: '#eda100',
  '500': '#e87ba4',
  '250': '#008300',
};

export type LevelTitles = { key: string; titles: number };

/** Arc path for a donut segment from angle a0 to a1 (radians, 0 = 12 o'clock, clockwise). */
function arc(cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string {
  const pt = (rad: number, a: number) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)].map((v) => v.toFixed(2)).join(' ');
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${pt(r, a0)} A ${r} ${r} 0 ${large} 1 ${pt(r, a1)} L ${pt(inner, a1)} A ${inner} ${inner} 0 ${large} 0 ${pt(inner, a0)} Z`;
}

export default function TitlesByLevel({ rows, name }: { rows: LevelTitles[]; name: string }) {
  const parts = ORDER.map((level) => ({ level, n: rows.find((r) => r.key === level)?.titles ?? 0 })).filter((p) => p.n > 0);
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (total < 2 || parts.length < 2) return null;
  const size = 180;
  const c = size / 2;
  const R = 84;
  const inner = 50;
  let a = 0;
  const segs = parts.map((p) => {
    const a0 = a;
    a += (p.n / total) * Math.PI * 2;
    return { ...p, d: arc(c, c, R, inner, a0, a) };
  });
  const top = parts.reduce((b, p) => (p.n > b.n ? p : b), parts[0]);
  return (
    <figure className="space-y-2" data-testid="tennis-titles-by-level">
      <figcaption className="text-sm text-ink-900 font-medium">{`${name}: ${total} titles by level`}</figcaption>
      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${name}'s ${total} titles: ${parts.map((p) => `${p.n} ${LEVEL_LABEL[p.level]}`).join(', ')}`}>
          {segs.map((s) => (
            <path key={s.level} d={s.d} fill={COLOUR[s.level]} stroke="#fcfcfb" strokeWidth={2} className="hover:opacity-80">
              <title>{`${LEVEL_LABEL[s.level]}: ${s.n} title${s.n === 1 ? '' : 's'} (${Math.round((s.n / total) * 100)}%)`}</title>
            </path>
          ))}
          <text x={c} y={c - 2} textAnchor="middle" className="fill-ink-900 font-display" fontSize={30}>{total}</text>
          <text x={c} y={c + 16} textAnchor="middle" className="fill-ink-500" fontSize={11}>titles</text>
        </svg>
        <ul className="text-sm space-y-1">
          {parts.map((p) => (
            <li key={p.level} className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm" style={{ background: COLOUR[p.level] }} />
              <span className="text-ink-700 w-24">{LEVEL_LABEL[p.level]}</span>
              <span className="font-mono tabular-nums text-ink-900">{p.n}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-ink-500">{`Most at ${LEVEL_LABEL[top.level]} level (${Math.round((top.n / total) * 100)}%). Tour-level titles in this data: no Olympics or team events.`}</p>
    </figure>
  );
}
