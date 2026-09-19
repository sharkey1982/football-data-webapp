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
  setPieceGoals,
  setPieceGoalPct,
  getFormationSlots,
  formationLabel,
  getFormationGeometry,
  getFormationNames,
  FORMATION_METRICS,
  type FormationSlot,
} from '../../lib/formationApi';

export default function FormationsPage() {
  const [slots, setSlots] = useState<FormationSlot[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState(FORMATION_METRICS[0].key);
  const [sortKey, setSortKey] = useState<'slot' | 'starts' | 'goal_share' | 'assist_share' | 'open_play_goals' | 'set_piece_assists' | 'opp_box_touches'>('slot');
  const [sortDesc, setSortDesc] = useState(false);
  const [compareSlot, setCompareSlot] = useState<number | null>(null);
  const [geometry, setGeometry] = useState<Map<string, Map<number, { slot: number; x_pct: number; y_pct: number }>>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useDocumentHead({
    title: "Managers' Dugout \u2014 where FPL goals come from",
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
    getFormationGeometry().then(setGeometry).catch(() => setGeometry(new Map()));
    getFormationNames().then(setNames).catch(() => setNames(new Map()));
  }, []);

  const formations = useMemo(() => {
    if (!slots) return [];
    const m = new Map<string, { code: string; canonical: string | null; starts: number }>();
    for (const r of slots) {
      const cur = m.get(r.source_formation_code) ?? { code: r.source_formation_code, canonical: names.get(r.source_formation_code) ?? r.canonical_formation, starts: 0 };
      cur.starts += r.starts;
      cur.canonical = names.get(r.source_formation_code) ?? cur.canonical;
      m.set(r.source_formation_code, cur);
    }
    // Team-starts, not player-starts: each XI contributes 11 rows.
    return [...m.values()].map((f) => ({ ...f, starts: Math.round(f.starts / 11) })).sort((a, b) => b.starts - a.starts);
  }, [slots, names]);

  const active = useMemo(() => (slots ?? []).filter((r) => r.source_formation_code === code), [slots, code]);
  const metric = FORMATION_METRICS.find((m) => m.key === metricKey)!;

  // Shares are already proportions; everything else is divided by starts
  // so formations with 33 starts can sit beside ones with 2,761.
  const valueOf = (r: FormationSlot) => {
    if (metric.key === 'set_piece_goals') {
      return r.starts > 0 ? setPieceGoals(r) / r.starts : 0;
    }
    const raw = Number(r[metric.key as keyof FormationSlot] ?? 0);
    if (metric.isShare) return raw * 100;
    return r.starts > 0 ? raw / r.starts : 0;
  };
    // Whole percentages: a slot producing "31.2%" of goals implies a
  // precision 251 starts can't support, and the extra digit crowds the
  // pitch markers.
  const fmt = (v: number) => (metric.isShare ? `${Math.round(v)}%` : v.toFixed(2));

  const values = active.map((r) => ({
    slot: Number(r.source_formation_slot),
    value: valueOf(r),
    starts: r.starts,
    // Goals and assists are the two numbers people actually compare, so
    // both sit on the marker rather than requiring a metric switch.
    goalShare: Math.round(r.goal_share * 100),
    assistShare: Math.round(r.assist_share * 100),
  }));
  const max = values.length ? Math.max(...values.map((v) => v.value)) : 0;

  const sortedActive = useMemo(() => {
    const get = (r: FormationSlot): number => {
      if (sortKey === 'slot') return Number(r.source_formation_slot);
      return Number(r[sortKey] ?? 0);
    };
    return active.slice().sort((a, b) => (sortDesc ? get(b) - get(a) : get(a) - get(b)));
  }, [active, sortKey, sortDesc]);

  // The same position across every formation -- the comparison that
  // answers "is this role more productive in one shape than another",
  // which reading formations one at a time can't.
  const slotAcrossFormations = useMemo(() => {
    if (compareSlot == null || !slots) return [];
    return slots
      .filter((r) => Number(r.source_formation_slot) === compareSlot)
      .map((r) => ({
        code: r.source_formation_code,
        canonical: r.canonical_formation,
        starts: r.starts,
        value: valueOf(r),
      }))
      .sort((a, b) => b.starts - a.starts);
  }, [slots, compareSlot, metricKey]);

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
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Managers&rsquo; Dugout</h1>
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
          {metric.label}{metric.isShare ? '' : ' per start'} &mdash; {current ? formationLabel(current.code, current.canonical) : ''}
        </h2>

        {/* Pitch. Plain SVG-free divs: a pitch is a green rectangle with
            some lines, which needs no charting dependency. */}
        {code && !geometry.has(code) && (
          <p className="text-sm text-ink-500 mt-2">
            No pitch layout is recorded for this formation, so positions aren&rsquo;t drawn. The table below still shows
            every slot.
          </p>
        )}
        <div className="relative mt-3 rounded-lg bg-pitch-800 border-2 border-pitch-600 aspect-[3/4] sm:aspect-[4/3] max-w-2xl overflow-hidden">
          <div className="absolute inset-x-0 top-1/2 border-t border-pitch-600/70" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-pitch-600/70" />
          <div className="absolute left-1/4 right-1/4 bottom-0 h-[18%] border-2 border-b-0 border-pitch-600/70" />
          <div className="absolute left-1/4 right-1/4 top-0 h-[18%] border-2 border-t-0 border-pitch-600/70" />

          {values.map(({ slot, value, starts, goalShare, assistShare }) => {
            // This formation's OWN geometry -- a shared template would
            // place a 5-3-2 sweeper in midfield.
            const pos = code ? geometry.get(code)?.get(slot) : undefined;
            if (!pos) return null;
            const intensity = max > 0 ? value / max : 0;
            return (
              <div
                key={slot}
                className="absolute -translate-x-1/2 translate-y-1/2 flex flex-col items-center"
                style={{ left: `${pos.x_pct}%`, bottom: `${pos.y_pct}%` }}
                title={`Slot ${slot} — ${fmt(value)}${metric.isShare ? ' of the formation total' : ' per start'} over ${starts} starts`}
              >
                <div
                  className="rounded-full border-2 border-chalk-100 flex items-center justify-center"
                  style={{
                    width: 'clamp(2.6rem, 9vw, 3.4rem)',
                    height: 'clamp(2.6rem, 9vw, 3.4rem)',
                    // Opacity carries the value -- a shared scale across
                    // positions, so the eye compares like with like.
                    backgroundColor: `rgba(227, 180, 85, ${0.15 + intensity * 0.85})`,
                  }}
                >
                  <span className="font-mono text-[0.65rem] text-ink-900 font-medium tabular-nums leading-none text-center">
                    {metric.isShare ? (
                      <>
                        {goalShare}%
                        <span className="block text-[0.55rem] font-normal opacity-70">{assistShare}% A</span>
                      </>
                    ) : (
                      fmt(value)
                    )}
                  </span>
                </div>
                <span className="font-mono text-[0.6rem] text-chalk-300 mt-0.5">{slot}</span>
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
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">
                  <button type="button" onClick={() => { if (sortKey === 'starts') setSortDesc(!sortDesc); else { setSortKey('starts'); setSortDesc(true); } }} className="hover:text-ink-900">
                    Starts{sortKey === 'starts' ? (sortDesc ? ' \u2193' : ' \u2191') : ''}
                  </button>
                </th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">
                  <button type="button" onClick={() => { if (sortKey === 'open_play_goals') setSortDesc(!sortDesc); else { setSortKey('open_play_goals'); setSortDesc(true); } }} className="hover:text-ink-900">
                    Open-play goals{sortKey === 'open_play_goals' ? (sortDesc ? ' \u2193' : ' \u2191') : ''}
                  </button>
                </th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">
                  <button type="button" onClick={() => { if (sortKey === 'goal_share') setSortDesc(!sortDesc); else { setSortKey('goal_share'); setSortDesc(true); } }} className="hover:text-ink-900">
                    % of goals{sortKey === 'goal_share' ? (sortDesc ? ' \u2193' : ' \u2191') : ''}
                  </button>
                </th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Set-piece goals</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">From set pieces</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">
                  <button type="button" onClick={() => { if (sortKey === 'assist_share') setSortDesc(!sortDesc); else { setSortKey('assist_share'); setSortDesc(true); } }} className="hover:text-ink-900">
                    Assists{sortKey === 'assist_share' ? (sortDesc ? ' \u2193' : ' \u2191') : ''}
                  </button>
                </th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">
                  <button type="button" onClick={() => { if (sortKey === 'assist_share') setSortDesc(!sortDesc); else { setSortKey('assist_share'); setSortDesc(true); } }} className="hover:text-ink-900">
                    % of assists{sortKey === 'assist_share' ? (sortDesc ? ' \u2193' : ' \u2191') : ''}
                  </button>
                </th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">
                  <button type="button" onClick={() => { if (sortKey === 'set_piece_assists') setSortDesc(!sortDesc); else { setSortKey('set_piece_assists'); setSortDesc(true); } }} className="hover:text-ink-900">
                    Set-piece assists{sortKey === 'set_piece_assists' ? (sortDesc ? ' \u2193' : ' \u2191') : ''}
                  </button>
                </th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">
                  <button type="button" onClick={() => { if (sortKey === 'opp_box_touches') setSortDesc(!sortDesc); else { setSortKey('opp_box_touches'); setSortDesc(true); } }} className="hover:text-ink-900">
                    Box touches{sortKey === 'opp_box_touches' ? (sortDesc ? ' \u2193' : ' \u2191') : ''}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedActive.map((r, i) => {
                  const slot = Number(r.source_formation_slot);
                  return (
                    <tr key={slot} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                      <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                        <button
                          type="button"
                          onClick={() => setCompareSlot(compareSlot === slot ? null : slot)}
                          className="text-pitch-800 underline underline-offset-2 hover:text-pitch-700"
                        >
                          {`Slot ${slot}`}
                        </button>{' '}
                        <span className="text-ink-500">({slot})</span>
                      </th>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.starts}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.open_play_goals.toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">{Math.round(r.goal_share * 100)}%</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{setPieceGoals(r).toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">
                        {(() => { const p = setPieceGoalPct(r); return p == null ? '\u2014' : `${p.toFixed(0)}%`; })()}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.assists.toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">{Math.round(r.assist_share * 100)}%</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.set_piece_assists.toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.opp_box_touches.toFixed(0)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {compareSlot != null && slotAcrossFormations.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
              {`Slot ${compareSlot}`} across every formation
            </h2>
            <button type="button" onClick={() => setCompareSlot(null)} className="text-sm text-pitch-800 underline underline-offset-2">
              Clear
            </button>
          </div>
          <p className="text-ink-700 text-sm mt-1 max-w-prose">
            {metric.label}{metric.isShare ? '' : ' per start'} for this position in each shape &mdash; the comparison
            that says whether a role is more productive in one formation than another.
          </p>
          <div className="space-y-2 mt-3">
            {(() => {
              const mx = Math.max(...slotAcrossFormations.map((f) => f.value), 0);
              return slotAcrossFormations.map((f) => (
                <div key={f.code} className="flex items-center gap-3">
                  <span className="w-28 sm:w-36 shrink-0 text-sm text-ink-700 truncate">
                    {formationLabel(f.code, f.canonical)}
                  </span>
                  <div className="flex-1 bg-chalk-200 rounded h-5 overflow-hidden">
                    <div className="bg-pitch-700 h-full rounded" style={{ width: `${mx > 0 ? (f.value / mx) * 100 : 0}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">{fmt(f.value)}</span>
                  {/* Sample size stated inline: a 33-start formation
                      topping this chart is noise, and hiding the count
                      would present it as a finding. */}
                  <span className="w-20 shrink-0 text-right font-mono text-[0.65rem] text-ink-500 tabular-nums">
                    {f.starts} starts
                  </span>
                </div>
              ));
            })()}
          </div>
        </section>
      )}

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
