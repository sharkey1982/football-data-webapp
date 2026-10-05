// ============================================================================
// src/components/tennis/TennisBits.tsx
//
// Small pieces shared by the tennis pages: the page header (crumb, title,
// tour toggle), player links and the level badge.
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TENNIS_DISCOVER_PATH, TENNIS_HUB_PATH, tennisPlayerPath } from '../../lib/tennisApi';
import { LEVEL_LABEL, type Level, type Tour } from '../../lib/tennisStats';
import { countryName } from '../../lib/tennisEvents';

export function TennisHeader({ title, crumb, toggle, children }: { title: string; crumb?: { to: string; label: string }; toggle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="space-y-2">
      <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
        <Link to={TENNIS_HUB_PATH} className="hover:underline">Tennis</Link> &middot;{' '}
        <Link to={crumb?.to ?? TENNIS_DISCOVER_PATH} className="hover:underline">{crumb?.label ?? 'Discover'}</Link>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">{title}</h1>
        {toggle}
      </div>
      {children}
    </header>
  );
}

export function PlayerLink({ tour, slug, name, rank }: { tour: Tour; slug: string; name: string; rank?: number | null }) {
  return (
    <>
      <Link to={tennisPlayerPath(tour, slug)} className="hover:underline">{name}</Link>
      {rank != null && <span className="font-mono text-xs text-ink-500">{` (${rank})`}</span>}
    </>
  );
}

const LEVEL_CLASS: Record<Level, string> = {
  'Grand Slam': 'bg-amber-500 text-pitch-950 border-amber-600',
  Finals: 'bg-pitch-800 text-chalk-100 border-pitch-900',
  '1000': 'bg-cup-700 text-chalk-100 border-cup-800',
  Premier: 'bg-white text-cup-800 border-cup-600',
  '500': 'bg-chalk-200 text-ink-700 border-chalk-300',
  '250': 'bg-white text-ink-500 border-chalk-300',
};

export function LevelBadge({ level }: { level: Level | null }) {
  if (!level) return null;
  return <span className={`inline-block border rounded px-1.5 py-0 text-[11px] font-mono ${LEVEL_CLASS[level]}`}>{LEVEL_LABEL[level]}</span>;
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="font-display uppercase tracking-wide text-lg text-ink-900">{title}</h2>
      {children}
    </section>
  );
}


/** Country name, or its ISO code when `short` (full name on hover). No flag
 * emoji: Windows shows those as two letters, which would read "GB GB". */
export function Country({ code, short = false }: { code: string | null | undefined; short?: boolean }) {
  if (!code) return <span className="text-ink-500">–</span>;
  return (
    <span className="whitespace-nowrap" title={countryName(code)}>
      {short ? <abbr title={countryName(code)} className="no-underline font-mono text-xs">{code}</abbr> : countryName(code)}
    </span>
  );
}

/** A plain labelled select, used for the tennis filters. */
export function FilterSelect({ label, value, onChange, options, testId }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; testId?: string }) {
  return (
    <label className="text-sm inline-flex items-center gap-1.5">
      <span className="text-ink-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-chalk-300 rounded px-2 py-1 bg-white max-w-[14rem]" data-testid={testId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
