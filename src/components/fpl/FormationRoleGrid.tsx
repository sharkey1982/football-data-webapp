// ============================================================================
// src/components/fpl/FormationRoleGrid.tsx
//
// Managers' Dugout: where the goals (or assists, or both) come from, by role,
// across the main formations -- one grid, one colour scale, so a colour means
// the same share in every column. Filter: Goals / Assists / Goals + assists.
// The takeaway names the role whose share changes most between formations.
// ============================================================================

import { useMemo, useState } from 'react';
import { buildRoleGrid, ROLES, type FormationSlot, type RoleMetric } from '../../lib/formationApi';

const METRICS: { key: RoleMetric; label: string; word: string }[] = [
  { key: 'goals', label: 'Goals', word: 'goals' },
  { key: 'assists', label: 'Assists', word: 'assists' },
  { key: 'ga', label: 'Goals + assists', word: 'goals and assists' },
];

// pale chalk (none) -> pitch green (the biggest share on the grid)
const LOW = { r: 0xf3, g: 0xf0, b: 0xe4 };
const HIGH = { r: 0x35, g: 0x75, b: 0x56 };
const shade = (t: number) => `rgb(${[LOW.r + (HIGH.r - LOW.r) * t, LOW.g + (HIGH.g - LOW.g) * t, LOW.b + (HIGH.b - LOW.b) * t].map(Math.round).join(', ')})`;

export default function FormationRoleGrid({ slots, geometry, names }: {
  slots: FormationSlot[];
  geometry: Map<string, Map<number, { slot: number; x_pct: number; y_pct: number }>>;
  names: Map<string, string>;
}) {
  const [metric, setMetric] = useState<RoleMetric>('goals');
  const grid = useMemo(() => buildRoleGrid(slots, geometry, names, metric), [slots, geometry, names, metric]);
  const word = METRICS.find((m) => m.key === metric)!.word;
  if (!grid.formations.length) return null;

  // the role whose share varies most between formations
  let takeaway: string | null = null, spread = 0;
  for (const r of ROLES) {
    const vals = grid.cells[r].map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null);
    if (vals.length < 2) continue;
    const hi = vals.reduce((a, b) => (b.v > a.v ? b : a)), lo = vals.reduce((a, b) => (b.v < a.v ? b : a));
    if (hi.v - lo.v > spread) {
      spread = hi.v - lo.v;
      takeaway = `${r}: ${Math.round(hi.v * 100)}% of a ${grid.formations[hi.i].name}'s ${word}, ${Math.round(lo.v * 100)}% of a ${grid.formations[lo.i].name}'s.`;
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="role-grid-h">
      <div>
        <h2 id="role-grid-h" className="font-display uppercase tracking-wide text-lg text-ink-900">Where the {word} come from</h2>
        {takeaway && <p className="text-sm text-ink-700">{takeaway}</p>}
      </div>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {METRICS.map((m) => (
          <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}
            className={['px-3 py-1.5 text-sm font-medium rounded-md border transition-colors',
              metric === m.key ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'bg-white text-ink-700 border-chalk-300 hover:bg-chalk-100'].join(' ')}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-chalk-300 bg-white" tabIndex={0} role="region" aria-labelledby="role-grid-h">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Share of each formation's {word} by role; columns are formations, most used first</caption>
          <thead className="bg-chalk-200">
            <tr>
              <th scope="col" className="text-left px-3 py-2 font-mono text-xs font-normal text-ink-500">Role</th>
              {grid.formations.map((f) => (
                <th key={f.code} scope="col" className="px-3 py-2 text-center">
                  <span className="block font-display text-base text-ink-900">{f.name}</span>
                  <span className="block font-mono text-[10px] text-ink-500">{f.matches} matches</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r} className="border-t border-chalk-200">
                <th scope="row" className="text-left px-3 py-2 font-normal whitespace-nowrap">{r}</th>
                {grid.cells[r].map((v, i) => {
                  const t = v == null ? 0 : v / grid.max;
                  return (
                    <td key={grid.formations[i].code} className="px-3 py-2 text-center font-mono tabular-nums"
                      style={v == null ? undefined : { backgroundColor: shade(t), color: t > 0.55 ? '#f5f2e8' : undefined }}
                      title={v == null ? undefined : `${r}, ${grid.formations[i].name}: ${Math.round(v * 100)}% of the team's ${word}`}>
                      {v == null ? <span className="text-ink-300">&mdash;</span> : `${Math.round(v * 100)}%`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-500">
        Share of each formation&rsquo;s {word}, by role. Formations used in at least 50 matches. Each column adds up to 100%.
        &mdash; means the formation has no player in that role.
      </p>
    </section>
  );
}
