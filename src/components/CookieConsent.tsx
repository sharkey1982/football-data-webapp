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
//
// The banner itself is in the static HTML (index.html, #cookie-consent),
// shown by an inline script before the app loads (audit 22 Oct 2026, S-07:
// rendered by React it appeared only after the JS bundle, and was the LCP
// element on a third of pages). This component wires its buttons and keeps
// its visibility right. Where the static banner is absent (tests, or a page
// built without the shell) it renders the same banner itself.
// ============================================================================

import { useEffect, useState } from 'react';
import { analyticsAvailable, getStoredConsent, grantConsent, denyConsent, initAnalytics } from '../lib/analytics';

export const STATIC_BANNER_ID = 'cookie-consent';

function choose(choice: string | undefined): void {
  if (choice === 'granted') grantConsent();
  else if (choice === 'denied') denyConsent();
}

export function CookieConsent() {
  const [decided, setDecided] = useState(true);
  const [useStatic, setUseStatic] = useState(false);

  useEffect(() => {
    const banner = document.getElementById(STATIC_BANNER_ID);
    if (!analyticsAvailable()) {
      if (banner) banner.hidden = true;
      setDecided(true);
      return;
    }
    // Re-applies a previous "granted" so returning visitors aren't asked
    // again and tracking resumes.
    initAnalytics();
    const undecided = getStoredConsent() === null;
    if (!banner) {
      setDecided(!undecided);
      return;
    }
    setUseStatic(true);
    banner.hidden = !undecided;
    const onClick = (e: Event) => {
      const button = (e.target as HTMLElement | null)?.closest?.('button[data-consent]') as HTMLButtonElement | null;
      if (!button) return;
      choose(button.dataset.consent);
      banner.hidden = true;
    };
    banner.addEventListener('click', onClick);
    return () => banner.removeEventListener('click', onClick);
  }, []);

  if (decided || useStatic) return null;

  return (
    <section
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-50 bg-pitch-900 text-chalk-100 border-t-2 border-amber-500"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
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
    </section>
  );
}
