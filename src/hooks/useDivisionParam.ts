// The finance pages' ?division= filter, read from and written to the URL so a
// filtered view can be linked to directly.
import { useSearchParams } from 'react-router-dom';
import type { DivisionOption } from '../lib/financeApi';

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
