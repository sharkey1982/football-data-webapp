// ============================================================================
// src/components/fpl/MinutesCells.tsx
//
// The shaded minutes cells from Minutes Outlook, shared with the Starting
// Lineups squad table (Chris, 10 Oct 2026: those tables should show how many
// minutes players are getting, like Minutes Outlook). Projections in green,
// what actually happened in grey.
// ============================================================================

import { ruleText, type OutlookActual, type OutlookCell } from '../../lib/minutesOutlookApi';

export type Mode = 'start' | 'minutes';

/** The numbers shown: expected (default) or if fit. null = nothing to show (out all window). */
function shownValues(c: OutlookCell, fit: boolean): { start: number; minutes: number } | null {
  if (!fit) return { start: c.start, minutes: c.minutes };
  return c.fitStart == null || c.fitMinutes == null ? null : { start: c.fitStart, minutes: c.fitMinutes };
}

export function Cell({ c, mode, fit, divider = false }: { c: OutlookCell | undefined; mode: Mode; fit: boolean; divider?: boolean }) {
  const edge = divider ? ' border-l-2 border-ink-500/40 pl-1' : '';
  if (!c) return <td className={`px-1 py-1 text-center text-ink-500 text-xs${edge}`}>&ndash;</td>;
  const shown = shownValues(c, fit);
  // If fit, an injured player still shows his value (with the dot); only
  // "out for the whole window" stays out.
  const out = shown == null || (!fit && c.availability === 0);
  const sv = shown ?? { start: 0, minutes: 0 };
  // Per fixture, so a double gameweek shades like a single one.
  const v = Math.max(0, Math.min(1, mode === 'start' ? sv.start / c.fixtures : sv.minutes / (90 * c.fixtures)));
  const flagged = c.availability != null && c.availability < 0.999 && (fit || c.availability > 0);
  const label = mode === 'start' ? `${Math.round((sv.start / c.fixtures) * 100)}` : `${Math.round(sv.minutes)}`;
  const why = ruleText(c.rule, c.availability);
  const title = [
    c.opponents,
    mode === 'start' ? `${Math.round((sv.start / c.fixtures) * 100)}% to start${fit ? ' if fit' : ''}` : `${Math.round(sv.minutes)} ${fit ? 'minutes if fit' : 'expected minutes'}`,
    c.fixtures > 1 ? `${c.fixtures} fixtures` : null,
    why,
    c.firstChoice ? 'Set as first choice when fit' : null,
  ].filter(Boolean).join(' · ');
  return (
    <td className={`px-0.5 py-0.5${edge}`} title={title}>
      <div
        className={`rounded text-center text-xs tabular-nums leading-7 min-w-10 ${v > 0.55 ? 'text-chalk-100' : 'text-ink-900'}`}
        style={{ backgroundColor: out ? 'transparent' : `color-mix(in srgb, var(--color-pitch-600) ${Math.round(v * 100)}%, transparent)` }}
      >
        {out ? (
          <span className="text-loss-700 font-medium">out</span>
        ) : (
          <>
            {flagged && <span className="text-amber-600" aria-label="availability doubt">&bull;</span>}
            {label}
            {c.fixtures > 1 && <sup className="ml-px">&times;{c.fixtures}</sup>}
          </>
        )}
      </div>
    </td>
  );
}

/** What actually happened, in grey so it reads apart from the green projections. */
export function ActualCell({ a, gw }: { a: OutlookActual | undefined; gw: number }) {
  if (!a) return <td className="px-0.5 py-0.5 text-center text-ink-500 text-xs" title={`GW${gw}: no record (not at the club yet)`}>&ndash;</td>;
  const out = !a.available && a.minutes === 0;
  const what = out ? 'Injured or suspended' : a.minutes === 0 ? 'Unused' : a.started ? `Started, ${a.minutes} minutes` : `Came off the bench, ${a.minutes} minutes`;
  const v = Math.min(1, a.minutes / 90);
  return (
    <td className="px-0.5 py-0.5" title={`GW${gw} actual: ${what}`}>
      <div
        className={`rounded text-center text-xs tabular-nums leading-7 min-w-10 ${v > 0.55 ? 'text-chalk-100' : 'text-ink-700'}`}
        style={{ backgroundColor: out ? 'transparent' : `color-mix(in srgb, var(--color-ink-500) ${Math.round(v * 70)}%, transparent)` }}
      >
        {out ? <span className="text-loss-700 font-medium">out</span> : <>{a.minutes}{a.minutes > 0 && !a.started && <sup className="ml-px">s</sup>}</>}
      </div>
    </td>
  );
}

