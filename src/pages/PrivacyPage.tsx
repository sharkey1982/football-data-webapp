// ============================================================================
// src/pages/PrivacyPage.tsx   (/privacy)
//
// Plain-English privacy notice: the FPL weekly email list and analytics.
// A static page (prerendered with its body, src/entry-server.tsx HUB_BODIES).
// Keep it in step with what the code does:
//   email list   supabase/migrations/20261101140000_fpl_weekly_email.sql
//                (what is stored, the 7-day and 30-day deletions)
//   analytics    src/lib/analytics.ts (GA4 only after consent)
// ============================================================================

import { useState, type ReactNode } from 'react';
import { denyConsent, getStoredConsent, grantConsent } from '../lib/analytics';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';

export const PRIVACY_TITLE = 'Privacy notice';
export const PRIVACY_DESCRIPTION = 'What FixtureShark collects for its FPL weekly email and its analytics, why, how long it is kept, and your rights.';
export const PRIVACY_CONTACT = 'privacy@fixtureshark.com';
export const PRIVACY_UPDATED = '1 November 2026';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{title}</h2>
      {children}
    </section>
  );
}

const P = 'text-ink-700';
const LI = 'list-disc pl-5 space-y-1 text-ink-700';
const A = 'text-pitch-800 underline underline-offset-2 hover:text-ink-900';

/** Change the cookie-banner choice. Browser only: nothing in the prerendered
 * HTML (the app replaces it on load). */
function AnalyticsChoice() {
  const [choice, setChoice] = useState<'granted' | 'denied' | null | undefined>(() =>
    typeof window === 'undefined' ? undefined : getStoredConsent());
  if (choice === undefined) return null;
  const btn = 'rounded border border-chalk-300 px-3 py-1.5 text-sm text-ink-900 hover:border-ink-500 disabled:opacity-60';
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="analytics-choice">
      <span className="text-sm text-ink-700">
        Google Analytics on this browser: <b>{choice === 'granted' ? 'allowed' : choice === 'denied' ? 'not allowed' : 'not chosen yet (off)'}</b>
      </span>
      <button type="button" className={btn} disabled={choice === 'granted'} onClick={() => { grantConsent(); setChoice('granted'); }}>Allow</button>
      <button type="button" className={btn} disabled={choice === 'denied'} onClick={() => { denyConsent(); setChoice('denied'); }}>Don&rsquo;t allow</button>
    </div>
  );
}

export default function PrivacyPage() {
  useDocumentHead({ title: PRIVACY_TITLE, description: PRIVACY_DESCRIPTION, path: '/privacy' });

  return (
    <article className="max-w-2xl space-y-6" data-testid="privacy-page">
      <header className="space-y-1">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">{PRIVACY_TITLE}</h1>
        <p className="font-mono text-xs text-ink-500">Last updated {PRIVACY_UPDATED}</p>
      </header>

      <p className={P}>
        This notice explains what FixtureShark (fixtureshark.com) collects about you, why, and what you can do about it.
        You can use the site without giving us any personal details.
      </p>

      <Section title="The FPL weekly email">
        <p className={P}>If you sign up for the FPL weekly email, we store:</p>
        <ul className={LI}>
          <li>your email address;</li>
          <li>your choices: whether you want the optional &ldquo;where our model and the market disagree&rdquo; section, and, only if you give them, your FPL team ID (the number), your club and the players on your watchlist;</li>
          <li>which version of the sign-up wording you agreed to;</li>
          <li>when you signed up, confirmed and (if you do) unsubscribed.</li>
        </ul>
        <p className={P}>
          We use these only to send you the email you asked for. If you give an FPL team ID, we read your squad from the
          public FPL website when each email is made, to add a &ldquo;Your team&rdquo; section. We keep only the ID
          number and your squad&rsquo;s player list for up to two days, not your name or anything else from your FPL account.
          Our lawful basis is your consent, which you give by confirming your address. You can withdraw it at any time.
        </p>
        <p className={P}>
          To stop sign-up abuse, we keep a scrambled (hashed) form of the address and of your internet (IP) address for two
          days. It can&rsquo;t be turned back into either.
        </p>
        <p className={P}>
          Nothing is sent until you click the link in the confirmation email. If you don&rsquo;t, your address is deleted
          after 7 days. We never sell or share the list, and we don&rsquo;t track whether you open the email.
        </p>
      </Section>

      <Section title="Who handles it for us">
        <p className={P}>
          Our database is run by Supabase. The emails are sent by Resend, which processes your address on our behalf. Resend
          is based in the United States; the transfer is covered by the standard contractual clauses approved for transfers
          of personal data out of the UK.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p className={P}>
          Until you unsubscribe. After that your address and choices are deleted within 30 days. Every email has a one-click
          unsubscribe link, and a link to change your choices (including removing your FPL team ID, club or watchlist).
        </p>
      </Section>

      <Section title="Analytics and cookies">
        <p className={P}>
          We use Google Analytics only if you accept it in the cookie banner. Until then it isn&rsquo;t loaded and sets no
          cookies. You can change your mind at any time here:
        </p>
        <AnalyticsChoice />
        <p className={P}>
          We also use Cloudflare Web Analytics, which counts visits without cookies and without identifying you.
        </p>
        <p className={P}>
          Some features remember things in your browser (for example your club or FPL ID on{' '}
          <Link to="/my" className={A}>My FixtureShark</Link>). That stays on your device and isn&rsquo;t sent to us.
        </p>
      </Section>

      <Section title="Your rights">
        <p className={P}>
          You can ask for a copy of what we hold about you, ask us to correct it or delete it, object to how we use it, or
          withdraw consent. Email <a href={`mailto:${PRIVACY_CONTACT}`} className={A}>{PRIVACY_CONTACT}</a> and we&rsquo;ll
          reply within a month. If you&rsquo;re unhappy with our answer, you can complain to the Information
          Commissioner&rsquo;s Office: <a href="https://ico.org.uk/make-a-complaint/" className={A}>ico.org.uk</a>.
        </p>
      </Section>

      <Section title="Contact">
        <p className={P}>
          Questions about this notice or your data: <a href={`mailto:${PRIVACY_CONTACT}`} className={A}>{PRIVACY_CONTACT}</a>.
        </p>
      </Section>
    </article>
  );
}
