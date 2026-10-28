// ============================================================================
// src/components/finance/DivisionFilter.tsx
//
// "All · Premier League · Championship · ..." filter for the finance pages.
// The choice lives in the URL (?division=championship) so a filtered view can
// be linked to directly. Options and counts come from divisionOptions().
// ============================================================================

import { useSearchParams } from 'react-router-dom';
import type { DivisionOption } from '../../lib/financeApi';

/** The ?division= value, ignored unless it names a division on offer. */
export function useDivisionParam(options: DivisionOption[]): [string | null, (slug: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('division');
  const value = raw && options.some((o) => o.slug === raw) ? raw : null;
  const set = (slug: string | null) => {
    const next = new URLSearchParams(params);
    if (slug) next.set('division', slug); else next.delete('division');
    setParams(next, { replace: true });
  };
  return [value, set];
}

type Props = { options: DivisionOption[]; value: string | null; onChange: (slug: string | null) => void; total: number };

export default function DivisionFilter({ options, value, onChange, total }: Props) {
  if (options.length < 2) return null;
  const btn = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-pitch-800 bg-pitch-800 text-chalk-100' : 'border-ink-500/30 text-ink-700 hover:border-pitch-800'}`;
  return (
    <div role="group" aria-label="Division" className="flex flex-wrap gap-2" data-testid="division-filter">
      <button type="button" className={btn(value == null)} aria-pressed={value == null} onClick={() => onChange(null)}>
        All ({total})
      </button>
      {options.map((o) => (
        <button key={o.slug} type="button" className={btn(value === o.slug)} aria-pressed={value === o.slug} onClick={() => onChange(o.slug)}>
          {o.name} ({o.count})
        </button>
      ))}
    </div>
  );
}
