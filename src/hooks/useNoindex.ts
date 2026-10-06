import { useEffect } from 'react';

/** Adds <meta name="robots" content="noindex"> while `active`. Every unknown
 * URL is served the app shell with HTTP 200, so a page whose entity doesn't
 * exist (a mistyped player, nation or season) must say noindex itself, or
 * search engines index it as a "soft 404". */
export function useNoindex(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const tag = document.createElement('meta');
    tag.setAttribute('name', 'robots');
    tag.setAttribute('content', 'noindex');
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [active]);
}
