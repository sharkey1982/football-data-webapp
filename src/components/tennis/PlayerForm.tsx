// ============================================================================
// src/components/tennis/PlayerForm.tsx
//
// Player page, phase 3 section F2/F3: form by surface and at each Grand Slam,
// for a chosen range of seasons (From / To). Built from the player's matches,
// which the page already has, so it renders in the static page too.
//
// Surface colours (validated with the dataviz palette check, light surface):
// Hard #2a6fdb, Clay #d9622b, Grass #1f9d55, Carpet #8e5bd0. Every line is
// also labelled at its end and the legend names it, so colour is never the
// only cue; the grids underneath are the table view.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { tennisEditionPath } from '../../lib/tennisApi';
import { rollingForm, SLAM_SHORT, SLAMS, slamGrid, surfaceGrid } from '../../lib/tennisEvents';
import { pctLabel, recordLabel, shortDate, type TennisMatch, type Tour } from '../../lib/tennisStats';
import { FilterSelect, Section } from './TennisBits';

const SURFACE_COLOUR: Record<string, string> = { Hard: '#2a6fdb', Clay: '#d9622b', Grass: '#1f9d55', Carpet: '#8e5bd0' };
const SLAM_SLUG: Record<string, string> = { 'Australian Open': 'australian-open', 'French Open': 'french-open', Wimbledon: 'wimbledon', 'US Open': 'us-open' };

/** Shade for a round reached at a Slam: deeper runs darker (one hue, light to dark). */
function depthClass(depth: number): string {
  if (depth >= 8) return 'bg-amber-500 text-ink-900 font-semibold';
  if (depth >= 7) return 'bg-pitch-800 text-chalk-100';
  if (depth >= 6) return 'bg-pitch-700 text-chalk-100';
  if (depth >= 5) return 'bg-pitch-600 text-chalk-100';
  if (depth >= 3) return 'bg-pitch-600/40 text-ink-900';
  return 'bg-pitch-600/15 text-ink-900';
}
function pctClass(p: number | null): string {
  if (p == null) return '';
  if (p >= 0.8) return 'bg-pitch-700 text-chalk-100';
  if (p >= 0.65) return 'bg-pitch-600 text-chalk-100';
  if (p >= 0.5) return 'bg-pitch-600/40 text-ink-900';
  if (p >= 0.35) return 'bg-pitch-600/15 text-ink-900';
  return 'bg-chalk-200 text-ink-700';
}

export default function PlayerForm({ tour, playerId, matches }: { tour: Tour; playerId: number; matches: TennisMatch[] }) {
  const allYears = useMemo(() => [...new Set(matches.map((m) => m.year))].sort((a, b) => a - b), [matches]);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const y0 = from ?? allYears[0];
  const y1 = to ?? allYears[allYears.length - 1];
  const inRange = useMemo(() => matches.filter((m) => m.year >= y0 && m.year <= y1), [matches, y0, y1]);
  const slams = useMemo(() => slamGrid(inRange, playerId), [inRange, playerId]);
  const surfaces = useMemo(() => surfaceGrid(inRange, playerId), [inRange, playerId]);
  const form = useMemo(() => rollingForm(matches, playerId), [matches, playerId]);
  if (allYears.length === 0) return null;

  const yearOptions = allYears.map((y) => ({ value: String(y), label: String(y) }));
  const hasSlams = slams.years.length > 0;
  const best = SLAMS.map((s) => ({ s, ...slams.totals[s] }))
    .filter((t) => t.won + t.lost > 0)
    .sort((a, b) => b.titles - a.titles || (b.won / (b.won + b.lost)) - (a.won / (a.won + a.lost)));

  return (
    <Section title="Form by surface and at the Grand Slams" id="tp-form">
      <div className="flex flex-wrap gap-3" data-testid="tennis-form-years">
        <FilterSelect label="From" value={String(y0)} onChange={(v) => { const n = Number(v); setFrom(n); if (n > y1) setTo(n); }} options={yearOptions} />
        <FilterSelect label="To" value={String(y1)} onChange={(v) => { const n = Number(v); setTo(n); if (n < y0) setFrom(n); }} options={yearOptions} />
      </div>

      <SurfaceFormChart form={form} from={y0} to={y1} />

      {hasSlams && (
        <div className="space-y-2">
          <h3 className="font-display uppercase tracking-wide text-base text-ink-900">At each Grand Slam</h3>
          {best.length > 0 && (
            <p className="text-sm text-ink-700" data-testid="tennis-best-slam">
              {best.map((t, i) => (
                <span key={t.s}>
                  {i > 0 && ' · '}
                  <span className={i === 0 ? 'font-semibold text-ink-900' : ''}>{t.s}</span>
                  {` ${recordLabel(t.won, t.lost)} (${pctLabel(t.won + t.lost ? t.won / (t.won + t.lost) : null)})${t.titles ? `, ${t.titles} title${t.titles === 1 ? '' : 's'}` : ''}`}
                </span>
              ))}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-0.5" data-testid="tennis-slam-grid">
              <caption className="sr-only">Round reached at each Grand Slam by season</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left font-normal text-ink-500 pr-2">Season</th>
                  {SLAMS.map((s) => <th key={s} scope="col" className="font-normal text-ink-500 px-1"><abbr title={s} className="no-underline">{SLAM_SHORT[s]}</abbr></th>)}
                </tr>
              </thead>
              <tbody>
                {slams.years.map((y) => (
                  <tr key={y}>
                    <th scope="row" className="text-left font-mono font-normal pr-2">{y}</th>
                    {SLAMS.map((s) => {
                      const c = slams.cells[y]?.[s];
                      return (
                        <td key={s} className={`w-11 h-7 text-center font-mono rounded ${c ? depthClass(c.depth) : 'text-ink-500'}`} title={c ? `${s} ${y}: ${c.champion ? 'champion' : c.reached}, ${recordLabel(c.won, c.lost)}` : `${s} ${y}: did not play`}>
                          {c ? <Link to={tennisEditionPath(tour, SLAM_SLUG[s], y)} className="block hover:underline">{c.reached}</Link> : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-500">R1–R4 rounds, QF quarter-final, SF semi-final, F final, W champion. Tap a run for that draw and both finalists' paths.</p>
        </div>
      )}

      {surfaces.years.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display uppercase tracking-wide text-base text-ink-900">Record by season and surface</h3>
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-0.5" data-testid="tennis-surface-grid">
              <caption className="sr-only">Win-loss by season and surface</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left font-normal text-ink-500 pr-2">Season</th>
                  {surfaces.surfaces.map((s) => <th key={s} scope="col" className="font-normal text-ink-500 px-1">{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {surfaces.years.map((y) => (
                  <tr key={y}>
                    <th scope="row" className="text-left font-mono font-normal pr-2">{y}</th>
                    {surfaces.surfaces.map((s) => {
                      const c = surfaces.cells[y]?.[s];
                      return (
                        <td key={s} className={`w-16 h-7 text-center font-mono rounded ${pctClass(c?.pct ?? null)}`} title={c ? `${y} ${s}: ${recordLabel(c.won, c.lost)}, ${pctLabel(c.pct)}` : undefined}>
                          {c ? recordLabel(c.won, c.lost) : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-500">Darker means a higher win %. Played matches only (no walkovers).</p>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Rolling form chart: win % over the last 20 matches on each surface
// ---------------------------------------------------------------------------
const W = 720;
const H = 240;
const PAD = { l: 40, r: 92, t: 12, b: 24 };

function SurfaceFormChart({ form, from, to }: { form: Record<string, { date: string; pct: number }[]>; from: number; to: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const start = Date.parse(`${from}-01-01T00:00:00Z`);
  const end = Date.parse(`${to}-12-31T00:00:00Z`);
  const lines = Object.entries(form)
    .map(([surface, pts]) => ({ surface, pts: pts.filter((p) => { const t = Date.parse(`${p.date}T12:00:00Z`); return t >= start && t <= end; }) }))
    .filter((l) => l.pts.length >= 2)
    .sort((a, b) => b.pts.length - a.pts.length);
  if (!lines.length) return <p className="text-sm text-ink-500">Not enough matches on any surface in these seasons for a form line (10+ needed).</p>;
  const x = (iso: string) => PAD.l + ((Date.parse(`${iso}T12:00:00Z`) - start) / Math.max(1, end - start)) * (W - PAD.l - PAD.r);
  const y = (p: number) => PAD.t + (1 - p) * (H - PAD.t - PAD.b);
  const yearTicks: number[] = [];
  const step = Math.max(1, Math.ceil((to - from + 1) / 8));
  for (let yr = from; yr <= to; yr += step) yearTicks.push(yr);

  // Hover: nearest point per line to the cursor's date.
  const hoverT = hover == null ? null : start + ((hover - PAD.l) / (W - PAD.l - PAD.r)) * (end - start);
  const near = hoverT == null ? [] : lines.map((l) => {
    let best = l.pts[0];
    for (const p of l.pts) if (Math.abs(Date.parse(`${p.date}T12:00:00Z`) - hoverT) < Math.abs(Date.parse(`${best.date}T12:00:00Z`) - hoverT)) best = p;
    return { surface: l.surface, ...best };
  });
  const last = lines.map((l) => ({ surface: l.surface, p: l.pts[l.pts.length - 1] }));
  // Spread end labels so they don't overlap.
  // Lines that stop before the range ends (Carpet after 2008) are labelled where they stop.
  const atEnd = (iso: string) => x(iso) >= W - PAD.r - 30;
  const labels = [...last].filter((l) => atEnd(l.p.date)).sort((a, b) => b.p.pct - a.p.pct).map((l) => ({ ...l, ly: y(l.p.pct) }));
  const early = last.filter((l) => !atEnd(l.p.date));
  for (let i = 1; i < labels.length; i++) if (labels[i].ly - labels[i - 1].ly < 13) labels[i].ly = labels[i - 1].ly + 13;

  return (
    <figure className="space-y-1" data-testid="tennis-form-chart">
      <figcaption className="text-sm text-ink-900 font-medium">Win % over the last 20 matches on each surface</figcaption>
      <ul className="flex flex-wrap gap-3 text-xs text-ink-700" aria-label="Legend">
        {lines.map((l) => (
          <li key={l.surface} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block w-3 h-0.5 rounded" style={{ background: SURFACE_COLOUR[l.surface] ?? '#6b7075' }} />
            {l.surface}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Rolling win % by surface, ${from} to ${to}. ${last.map((l) => `${l.surface} ${pctLabel(l.p.pct)} at ${shortDate(l.p.date)}`).join('; ')}.`}
          onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHover(((e.clientX - r.left) / r.width) * W); }}
          onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <g key={g}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="#d8d2bd" strokeWidth={g === 0.5 ? 1 : 0.5} strokeDasharray={g === 0.5 ? undefined : '2 3'} />
              <text x={PAD.l - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill="#6b7075">{`${g * 100}%`}</text>
            </g>
          ))}
          {yearTicks.map((yr) => (
            <text key={yr} x={x(`${yr}-07-01`)} y={H - 6} textAnchor="middle" fontSize="11" fill="#6b7075">{yr}</text>
          ))}
          {lines.map((l) => (
            <polyline key={l.surface} fill="none" stroke={SURFACE_COLOUR[l.surface] ?? '#6b7075'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={l.pts.map((p) => `${x(p.date).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ')} />
          ))}
          {labels.map((l) => (
            <text key={l.surface} x={W - PAD.r + 6} y={l.ly + 4} fontSize="11" fill="#3a3f42">{`${l.surface} ${pctLabel(l.p.pct)}`}</text>
          ))}
          {early.map((l) => (
            <text key={l.surface} x={x(l.p.date) + 4} y={y(l.p.pct) - 6} fontSize="11" fill="#3a3f42">{`${l.surface} (to ${l.p.date.slice(0, 4)})`}</text>
          ))}
          {hover != null && hover >= PAD.l && hover <= W - PAD.r && (
            <g>
              <line x1={hover} x2={hover} y1={PAD.t} y2={H - PAD.b} stroke="#6b7075" strokeWidth={1} />
              {near.map((n) => <circle key={n.surface} cx={x(n.date)} cy={y(n.pct)} r={4} fill={SURFACE_COLOUR[n.surface] ?? '#6b7075'} stroke="#fff" strokeWidth={2} />)}
            </g>
          )}
        </svg>
        {hover != null && near.length > 0 && hover >= PAD.l && hover <= W - PAD.r && (
          <div className="pointer-events-none absolute top-0 rounded border border-chalk-300 bg-white px-2 py-1 text-xs shadow-sm" style={{ left: `${Math.min(70, (hover / W) * 100)}%` }}>
            {near.map((n) => <div key={n.surface}><span className="text-ink-500">{n.surface}</span> {pctLabel(n.pct)} <span className="text-ink-500">({shortDate(n.date)})</span></div>)}
          </div>
        )}
      </div>
      <p className="text-xs text-ink-500">Each point is the share of the last 20 played matches on that surface won (from the 10th match). The season grid below has the numbers.</p>
    </figure>
  );
}
