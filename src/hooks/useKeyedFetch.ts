// ============================================================================
// src/hooks/useKeyedFetch.ts
//
// Fetch once per key. The result is stored with the key it was fetched for, so
// "loading" is derived (stored key !== current key) instead of being reset
// synchronously inside the effect. A null key means "not ready yet". Late
// responses for an old key are dropped.
// ============================================================================

import { useEffect, useState } from 'react';

type Entry<T> = { key: string; data: T | null; failed: boolean };

export function useKeyedFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  initial?: { key: string; data: T }
): { data: T | null; failed: boolean; loading: boolean } {
  const [entry, setEntry] = useState<Entry<T> | null>(initial ? { key: initial.key, data: initial.data, failed: false } : null);
  const current = entry && key !== null && entry.key === key ? entry : null;

  useEffect(() => {
    if (key === null || current) return;
    let live = true;
    fetcher()
      .then((data) => {
        if (live) setEntry({ key, data, failed: false });
      })
      .catch(() => {
        if (live) setEntry({ key, data: null, failed: true });
      });
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data: current?.data ?? null, failed: Boolean(current?.failed), loading: key !== null && !current };
}
