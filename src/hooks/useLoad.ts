import { useEffect, useState } from 'react';

export type Load<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error' };

/** Loads once per key; a new key starts again from "loading". A null key
 *  loads nothing (and stays "loading"). Used by the Today page. */
export function useLoad<T>(key: string | null, fn: () => Promise<T>): Load<T> {
  const [state, setState] = useState<{ key: string | null; load: Load<T> }>({ key, load: { status: 'loading' } });
  useEffect(() => {
    if (key == null) return;
    let cancelled = false;
    fn()
      .then((data) => { if (!cancelled) setState({ key, load: { status: 'ok', data } }); })
      .catch(() => { if (!cancelled) setState({ key, load: { status: 'error' } }); });
    return () => { cancelled = true; };
    // fn is recreated each render; the key says when the request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.load : { status: 'loading' };
}
