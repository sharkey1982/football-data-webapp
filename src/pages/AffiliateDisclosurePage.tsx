// ============================================================================
// src/pages/AffiliateDisclosurePage.tsx
//
// Required by affiliate network terms to exist as a real page, not just
// referenced in a tooltip -- the inline "Ad" tag next to an affiliate link
// (see MatchPage) links here. Plain, factual, no persuasion -- matches the
// rest of the site's tone.
// ============================================================================

import { useDocumentHead } from '../hooks/useDocumentHead';

export default function AffiliateDisclosurePage() {
  useDocumentHead({
    title: 'Affiliate Disclosure',
    description: 'How FixtureShark uses affiliate links, and what that does and does not affect.',
    path: '/affiliate-disclosure',
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Affiliate Disclosure</h1>

      <p className="text-ink-700">
        Some links on FixtureShark, such as a "Watch" link next to a fixture, may be affiliate
        links. If you click one and go on to sign up for or buy something, FixtureShark may earn a
        commission from the company you signed up with. This costs you nothing extra.
      </p>

      <p className="text-ink-700">
        Any link marked with a small "Ad" tag next to it is an affiliate link. Links without that
        tag are not.
      </p>

      <p className="text-ink-700">
        Whether a fixture is on a given channel or streaming service is a fact we report
        independently of any affiliate relationship. We show broadcast information for every
        confirmed fixture we know about, whether or not we have a commercial relationship with the
        broadcaster in question, and we never omit or delay a broadcaster's information because
        they don't pay commission.
      </p>

      <p className="text-ink-700">
        We don't accept payment to favour one broadcaster, streaming service, or provider over
        another in what we show you. Where more than one legitimate way to watch or buy something
        exists, an affiliate relationship with one of them is never the reason we recommend it.
      </p>
    </div>
  );
}
