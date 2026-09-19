// ============================================================================
// src/pages/fpl/FormationsPage.tsx
//
// Where goals and assists actually come from, by position and formation.
//
// Built on Opta 2011/12 Premier League data aggregated to formation
// slots. Shown per start rather than as totals, because formations have
// wildly different sample sizes (2,761 starts down to 33) and totals
// would just rank them by popularity.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getFormationSlots,
  formationLabel,
  SLOT_POSITIONS,
  FORMATION_METRICS,
  type FormationSlot,
} from '../../lib/formationApi';

export default function FormationsPage() {
  const [slots, setSlots] = useState<FormationSlot[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState(FORMATION_METRICS[0].key);

  useDocumentHead({
    title: 'Where goals come from, by formation',
    description:
      'Open-play goals, assists and box touches by pitch position across Premier League formations, from Opta match data.',
    path: '/fpl/formations',
  });

  useEffect(() => {
    getFormationSlots()
      .then((s) => {
        setSlots(s);
        const byStarts = new Map<string, number>();
        for (const r of s) byStarts.set(r.source_formation_code, (byStarts.get(r.source_formation_code) ?? 0) + r.starts);
        const top = [...byStarts.entries()].sort((a, b) => b[1] - a[1])[0];
        setCode(top?.[0] ?? null);
      })
      .catch(() => setSlots([]));
  }, []);

  const formations = useMemo(() => {
    if (!slots) return [];
    const m = new Map<string, { code: string; canonical: string | null; starts: number }>();
    for (const r of slots) {
      const cur = m.get(r.source_formation_code) ?? { code: r.source_formation_code, canonical: r.canonical_formation, starts: 0 };
      cur.starts += r.starts;
      if (r.canonical_formation) cur.canonical = r.canonical_formation;
      m.set(r.source_formation_code, cur);
    }
    // Team-starts, not player-starts: each XI contributes 11 rows.
    return [...m.values()].map((f) => ({ ...f, starts: Math.round(f.starts / 11) })).sort((a, b) => b.starts - a.starts);
  }, [slots]);

  const active = useMemo(() => (slots ?? []).filter((r) => r.source_formation_code === code), [slots, code]);
  const metric = FORMATION_METRICS.find((m) => m.key === metricKey)!;

  const values = active.map((r) => {
    const raw = Number(r[metric.key] ?? 0);
    return { slot: Number(r.source_formation_slot), value: r.starts > 0 ? raw / r.starts : 0, starts: r.starts };
  });
  const max = values.length ? Math.max(...values.map((v) => v.value)) : 0;

  if (slots === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (slots.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Formations</h1>
        <p className="text-ink-700 mt-2">No formation data is available right now.</p>
      </div>
    );
  }

  const current = formations.find((f) => f.code === code);

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Where the goals come from</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Opta match data for a full Premier League season, broken down by pitch position and formation. Every figure is
          per start, so formations used 30 times can be compared with ones used 250 times.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Formation</span>
          <select
            value={code ?? ''}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
          >
            {formations.map((f) => (
              <option key={f.code} value={f.code}>
                {formationLabel(f.code, f.canonical)} — {f.starts} starts
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Show</span>
          <select
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value as typeof metricKey)}
            className="mt-1 border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
          >
            {FORMATION_METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
          {metric.label} per start &mdash; {current ? formationLabel(current.code, current.canonical) : ''}
        </h2>

        {/* Pitch. Plain SVG-free divs: a pitch is a green rectangle with
            some lines, which needs no charting dependency. */}
        <div className="relative mt-3 rounded-lg bg-pitch-800 border-2 border-pitch-600 aspect-[3/4] sm:aspect-[4/3] max-w-2xl overflow-hidden">
          <div className="absolute inset-x-0 top-1/2 border-t border-pitch-600/70" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-pitch-600/70" />
          <div className="absolute left-1/4 right-1/4 bottom-0 h-[18%] border-2 border-b-0 border-pitch-600/70" />
          <div className="absolute left-1/4 right-1/4 top-0 h-[18%] border-2 border-t-0 border-pitch-600/70" />

          {values.map(({ slot, value, starts }) => {
            const pos = SLOT_POSITIONS[slot];
            if (!pos) return null;
            const intensity = max > 0 ? value / max : 0;
            return (
              <div
                key={slot}
                className="absolute -translate-x-1/2 translate-y-1/2 flex flex-col items-center"
                style={{ left: `${pos.x}%`, bottom: `${pos.y}%` }}
                title={`${pos.label} (slot ${slot}) — ${value.toFixed(2)} per start over ${starts} starts`}
              >
                <div
                  className="rounded-full border-2 border-chalk-100 flex items-center justify-center"
                  style={{
                    width: 'clamp(2.2rem, 8vw, 3rem)',
                    height: 'clamp(2.2rem, 8vw, 3rem)',
                    // Opacity carries the value -- a shared scale across
                    // positions, so the eye compares like with like.
                    backgroundColor: `rgba(227, 180, 85, ${0.15 + intensity * 0.85})`,
                  }}
                >
                  <span className="font-mono text-xs text-ink-900 font-medium tabular-nums">{value.toFixed(2)}</span>
                </div>
                <span className="font-mono text-[0.6rem] text-chalk-300 mt-0.5">{pos.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Every position, this formation</h2>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Position</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Starts</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Open-play goals</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Assists</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Set-piece assists</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Box touches</th>
              </tr>
            </thead>
            <tbody>
              {active
                .slice()
                .sort((a, b) => Number(a.source_formation_slot) - Number(b.source_formation_slot))
                .map((r, i) => {
                  const slot = Number(r.source_formation_slot);
                  const pos = SLOT_POSITIONS[slot];
                  return (
                    <tr key={slot} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                      <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                        {pos?.label ?? `Slot ${slot}`} <span className="text-ink-500">({slot})</span>
                      </th>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.starts}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.open_play_goals.toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.assists.toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.set_piece_assists.toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.opp_box_touches.toFixed(0)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-chalk-300 rounded-lg bg-white p-4">
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">About this data</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          Opta player-match data for one Premier League season, aggregated by formation slot. Positions follow
          traditional shirt numbering, which was checked against the data rather than assumed &mdash; slot 1 records one
          goal and no box touches across 251 starts, while slots 9 and 10 average over four box touches each.
        </p>
        <p className="text-ink-500 text-sm mt-2 max-w-prose">
          Formations other than 4-4-2 are shown by their source code. Opta&rsquo;s code list isn&rsquo;t published and the
          original workbook isn&rsquo;t stored here, so naming them would be guesswork. Set-piece figures cover assists
          only &mdash; set-piece goals aren&rsquo;t in this dataset.
        </p>
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/set-pieces" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Set-piece takers
        </Link>
        <Link to="/fpl/start/discover" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More to discover
        </Link>
      </nav>
    </article>
  );
}
