// ============================================================================
// src/components/EmailSignup.tsx
//
// Sign-up for "FixtureShark FPL weekly" (one email before each FPL deadline).
// On /fpl/start, the gameweek log and its reports (variant "card"), and in the
// site footer (variant "compact").
//
// A real <form> posting to the email-list edge function, so it works in the
// prerendered HTML before (or without) JavaScript: the function answers a
// form post with a redirect to /email/confirm?state=check. Once React runs,
// the submit is sent with fetch and the answer is shown in place.
//
// Double opt-in: nothing is sent until the address is confirmed. The answer
// is always "check your email", so the form never says whether an address is
// already on the list. "website" is a honeypot for bots (hidden from people
// and screen readers).
// ============================================================================

import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EMAIL_LIST_URL, parseFplId, subscribe, type SubscribeState } from '../lib/emailApi';
import { readPrefs } from '../lib/myPrefs';
import EmailPersonalise from './EmailPersonalise';

type State = 'idle' | 'sending' | SubscribeState;

export default function EmailSignup({ variant = 'card' }: { variant?: 'card' | 'compact' }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [football, setFootball] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<State>('idle');
  // Optional "Your team": prefilled from My FixtureShark (this browser only).
  // The prerendered HTML has none (no browser); the app replaces it on load
  // (createRoot, not hydration), so there is no mismatch to avoid.
  const [prefs] = useState(() => (typeof window === 'undefined' ? null : readPrefs()));
  const [fplId, setFplId] = useState(prefs?.fplId ?? '');
  const [clubId, setClubId] = useState<number | null>(prefs?.club?.teamId ?? null);
  const clubName = prefs?.club?.name ?? null;
  const [open, setOpen] = useState(!!(prefs?.fplId || prefs?.club));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setState(await subscribe(email.trim(), football, website, { fplId: parseFplId(fplId), clubId }));
  }

  const compact = variant === 'compact';
  const done = state === 'check';

  return (
    <section
      aria-labelledby={`${id}-h`}
      data-testid={compact ? 'email-signup-compact' : 'email-signup'}
      className={compact ? 'text-sm' : 'rounded-lg border border-chalk-300 bg-white p-4 sm:p-5 max-w-xl'}
    >
      <h2 id={`${id}-h`} className={compact ? 'font-semibold text-ink-900' : 'font-display uppercase tracking-wide text-lg text-ink-900'}>
        FPL weekly email
      </h2>
      {!compact && (
        <p className="text-sm text-ink-700 mt-1">
          One email before each deadline: our top captains, flagged players, price changes and the gameweek preview.
        </p>
      )}

      {done ? (
        <p role="status" className="mt-2 text-ink-900" data-testid="email-signup-status">
          Check your email. We&rsquo;ve sent a link to confirm; nothing else is sent until you click it.
        </p>
      ) : (
        <form method="post" action={EMAIL_LIST_URL} onSubmit={submit} className="mt-2 space-y-2">
          <input type="hidden" name="action" value="subscribe" />
          <div className="flex flex-wrap gap-2 items-end">
            <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (state !== 'idle' && state !== 'sending') setState('idle'); }}
              className="min-w-0 flex-1 basis-56 rounded border border-chalk-300 bg-white px-3 py-2 text-ink-900"
            />
            <button
              type="submit"
              disabled={state === 'sending'}
              className="rounded bg-pitch-800 px-4 py-2 font-medium text-chalk-100 hover:bg-pitch-700 disabled:opacity-60"
            >
              {state === 'sending' ? 'Sending…' : 'Sign up'}
            </button>
          </div>
          <div className="flex items-start gap-2">
            <input
              id={`${id}-football`}
              name="football"
              type="checkbox"
              value="1"
              checked={football}
              onChange={(e) => setFootball(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor={`${id}-football`} className="text-sm text-ink-700">
              Also include where our model and the betting market disagree on the weekend&rsquo;s games. I&rsquo;m 18 or over.
            </label>
          </div>
          <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="text-sm">
            <summary className="cursor-pointer text-ink-700">Add your FPL team and club (optional)</summary>
            <div className="mt-2 space-y-1">
              <EmailPersonalise fplId={fplId} clubId={clubId} clubName={clubName} onFplId={setFplId} onClub={setClubId} active={open} />
              <p className="text-xs text-ink-500">Adds a &ldquo;Your team&rdquo; section: your flagged players, price moves and best captain, and your club&rsquo;s next game.</p>
            </div>
          </details>
          {/* Honeypot: people never see or fill this. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
            <label htmlFor={`${id}-website`}>Leave this empty</label>
            <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <p className="text-xs text-ink-500">
            We&rsquo;ll email you a link to confirm. Unsubscribe in one click from any email. See our{' '}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-ink-900">privacy notice</Link>.
          </p>
          {state === 'invalid' && <p role="alert" className="text-sm text-loss-700">That email address doesn&rsquo;t look right.</p>}
          {state === 'error' && <p role="alert" className="text-sm text-loss-700">Something went wrong. Please try again in a minute.</p>}
        </form>
      )}
    </section>
  );
}
