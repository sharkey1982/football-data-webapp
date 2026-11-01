// ============================================================================
// src/components/today/TodayParts.tsx
//
// Shared pieces of the Today page (/today): the section heading, a card, the
// load hook, and the probability bar used on the club card. Same tokens as
// the hubs (chalk / ink / pitch / amber, font-display headings).
// ============================================================================

import type { ReactNode } from 'react';

export const EYEBROW = 'font-mono text-[11px] uppercase tracking-widest text-ink-500';
export const LINK = 'text-pitch-800 hover:text-pitch-700 underline underline-offset-2';
/** A 44px tap target that looks like a link. */
export const TAP_LINK = `inline-flex items-center min-h-11 ${LINK}`;
export const BUTTON = 'inline-flex items-center justify-center min-h-11 px-4 rounded-lg border text-sm';

export function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="font-display uppercase tracking-wide text-2xl text-ink-900">{title}</h2>
      {children}
    </div>
  );
}

export function Card({ children, className = '', testId, label }: { children: ReactNode; className?: string; testId?: string; label?: string }) {
  return (
    <div className={`bg-white border border-chalk-300 rounded-lg p-4 space-y-2 min-w-0 ${className}`} data-testid={testId} aria-label={label} role={label ? 'group' : undefined}>
      {children}
    </div>
  );
}

export function Skeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <span key={i} className="block h-4 w-2/3 rounded bg-chalk-200" />)}
    </div>
  );
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function ProbRow({ label, p, strong }: { label: string; p: number; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
      <span className={`truncate ${strong ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{label}</span>
      <span className="h-2.5 rounded-full bg-chalk-200" aria-hidden="true">
        <span className={`block h-2.5 rounded-full ${strong ? 'bg-amber-600' : 'bg-pitch-700'}`} style={{ width: pct(p) }} />
      </span>
      <span className={`font-mono text-right tabular-nums ${strong ? 'font-semibold' : ''}`}>{pct(p)}</span>
    </div>
  );
}
