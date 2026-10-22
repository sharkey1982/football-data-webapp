// ============================================================================
// src/pages/NotFoundPage.tsx
//
// Catch-all route. Needed because netlify.toml now serves the app shell for
// any path without a generated file (so client-only pages like /tv-guide
// load on a direct visit instead of 404ing). The cost of that fallback is
// that a mistyped URL also gets HTTP 200 -- a "soft 404". Marking this page
// noindex is what stops search engines indexing those.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { useNoindex } from '../hooks/useNoindex';

/** Every "no such thing" branch renders this (audit 22 Oct 2026, S-05), so
 * each one is noindex. `message` and `back` let a page point to its list. */
export default function NotFoundPage({ heading = 'Page not found', message, back }: { heading?: string; message?: string; back?: { to: string; label: string } } = {}) {
  useDocumentHead({ title: heading });

  useNoindex(true);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="mt-3 text-sm opacity-80">{message ?? 'This address doesn\u2019t match any page.'}</p>
      <p className="mt-6">
        <Link to={back?.to ?? '/'} className="underline">
          {back?.label ?? 'Go to the home page'}
        </Link>
      </p>
    </div>
  );
}
