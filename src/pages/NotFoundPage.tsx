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

export default function NotFoundPage() {
  useDocumentHead({ title: 'Page not found' });

  useNoindex(true);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-3 text-sm opacity-80">This address doesn&rsquo;t match any page.</p>
      <p className="mt-6">
        <Link to="/" className="underline">
          Go to the home page
        </Link>
      </p>
    </div>
  );
}
