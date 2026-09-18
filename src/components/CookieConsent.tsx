// ============================================================================
// src/components/CookieConsent.tsx
//
// Opt-in cookie banner. UK PECR requires consent BEFORE non-essential
// cookies are set, so "carry on browsing to accept" or a pre-ticked box
// wouldn't do -- Accept and Decline are given equal visual weight, and
// nothing analytics-related loads until one is chosen.
//
// Renders nothing at all when analytics couldn't run anyway (no
// measurement ID, or not the production host). Showing a cookie banner
// on localhost, or on a deploy preview that will never load gtag, would
// be asking consent for something that isn't going to happen.
// ============================================================================

import { useEffect, useState } from 'react';
import { analyticsAvailable, getStoredConsent, grantConsent, denyConsent, initAnalytics } from '../lib/analytics';

export function CookieConsent() {
  const [decided, setDecided] = useState(true);

  useEffect(() => {
    if (!analyticsAvailable()) {
      setDecided(true);
      return;
    }
    // Re-applies a previous "granted" so returning visitors aren't asked
    // again and tracking resumes.
    initAnalytics();
    setDecided(getStoredConsent() !== null);
  }, []);

  if (decided) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-50 bg-pitch-900 text-chalk-100 border-t-2 border-amber-500"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm flex-1">
          We&rsquo;d like to use analytics cookies to understand how the site is used. They&rsquo;re optional, and
          nothing is set unless you accept.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              denyConsent();
              setDecided(true);
            }}
            className="text-sm border border-chalk-300 text-chalk-100 rounded px-4 py-2 hover:bg-pitch-800 transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => {
              grantConsent();
              setDecided(true);
            }}
            className="text-sm bg-amber-500 text-ink-900 rounded px-4 py-2 hover:bg-amber-400 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
