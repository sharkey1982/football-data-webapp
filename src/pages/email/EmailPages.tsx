// ============================================================================
// src/pages/email/EmailPages.tsx
//
// The FPL weekly email's own pages, all noindex (and X-Robots-Tag in
// netlify.toml):
//   /email/confirm      ?t=<token>  confirms a sign-up (double opt-in)
//                       ?state=check|invalid  where the no-JavaScript form lands
//   /email/unsubscribe  ?t=<token>  unsubscribes on arrival: the one click
//   /email/manage       ?t=<token>  the optional football section, FPL team ID, club and watchlist
// The token is the only key; nothing here says whether an address exists.
// ============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useNoindex } from '../../hooks/useNoindex';
import { confirmEmail, manageEmail, parseFplId, unsubscribeEmail, type ConfirmState, type ManageChanges, type ManageResult, type UnsubscribeState, type WatchPlayer } from '../../lib/emailApi';
import EmailPersonalise from '../../components/EmailPersonalise';
import EmailWatchlist from '../../components/EmailWatchlist';

const LINK = 'text-pitch-800 underline underline-offset-2 hover:text-ink-900';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-xl space-y-3" data-testid="email-page">
      <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">FPL weekly email</p>
      <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">{title}</h1>
      <div className="space-y-3 text-ink-700">{children}</div>
    </div>
  );
}

const BACK = (
  <p>
    <Link to="/fpl/start" className={LINK}>Back to FPL</Link> &middot; <Link to="/privacy" className={LINK}>Privacy</Link>
  </p>
);

export function EmailConfirmPage() {
  useDocumentHead({ title: 'Confirm your email', description: 'Confirm your FixtureShark FPL weekly email.' });
  useNoindex(true);
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const landed = params.get('state');
  const [state, setState] = useState<ConfirmState | 'working' | null>(token ? 'working' : null);
  const [manage, setManage] = useState<string | undefined>();

  useEffect(() => {
    if (!token) return;
    let live = true;
    confirmEmail(token).then((r) => { if (live) { setState(r.state); setManage(r.manage); } });
    return () => { live = false; };
  }, [token]);

  if (!token) {
    if (landed === 'invalid') {
      return <Shell title="Check the address">{<p>That email address doesn&rsquo;t look right. <Link to="/fpl/start" className={LINK}>Try again</Link>.</p>}{BACK}</Shell>;
    }
    return (
      <Shell title="Check your email">
        <p>We&rsquo;ve sent a link to confirm your sign-up. Nothing else is sent until you click it. The link works for 7 days.</p>
        <p>Not there? Check your spam folder.</p>
        {BACK}
      </Shell>
    );
  }
  if (state === 'working') return <Shell title="Confirming…"><p>One moment.</p></Shell>;
  if (state === 'confirmed' || state === 'already') {
    return (
      <Shell title={state === 'confirmed' ? 'You’re signed up' : 'Already signed up'}>
        <p>
          {state === 'confirmed' ? 'Thanks for confirming. ' : 'This address is already confirmed. '}
          FixtureShark FPL weekly arrives before each FPL deadline.
        </p>
        {manage && <p><Link to={`/email/manage?t=${manage}`} className={LINK}>Change what you get</Link></p>}
        {BACK}
      </Shell>
    );
  }
  if (state === 'invalid') {
    return (
      <Shell title="Link not recognised">
        <p>This link has expired or has already been replaced. <Link to="/fpl/start" className={LINK}>Sign up again</Link> and we&rsquo;ll send a new one.</p>
        {BACK}
      </Shell>
    );
  }
  return <Shell title="Something went wrong"><p>We couldn&rsquo;t confirm just now. Please try the link again in a minute.</p>{BACK}</Shell>;
}

export function EmailUnsubscribePage() {
  useDocumentHead({ title: 'Unsubscribe', description: 'Unsubscribe from the FixtureShark FPL weekly email.' });
  useNoindex(true);
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [state, setState] = useState<UnsubscribeState | 'working'>(token ? 'working' : 'invalid');

  useEffect(() => {
    if (!token) return;
    let live = true;
    unsubscribeEmail(token).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [token]);

  if (state === 'working') return <Shell title="Unsubscribing…"><p>One moment.</p></Shell>;
  if (state === 'unsubscribed' || state === 'already') {
    return (
      <Shell title="You’re unsubscribed">
        <p>You won&rsquo;t get any more FPL weekly emails. Your address is deleted from our list within 30 days.</p>
        <p>Changed your mind? You can sign up again on <Link to="/fpl/start" className={LINK}>the FPL page</Link>.</p>
        {BACK}
      </Shell>
    );
  }
  if (state === 'invalid') {
    return (
      <Shell title="Link not recognised">
        <p>We couldn&rsquo;t match this link. If you&rsquo;re still getting emails, use the unsubscribe link in the most recent one.</p>
        {BACK}
      </Shell>
    );
  }
  return <Shell title="Something went wrong"><p>We couldn&rsquo;t unsubscribe you just now. Please try the link again in a minute.</p>{BACK}</Shell>;
}

export function EmailManagePage() {
  useDocumentHead({ title: 'Email choices', description: 'Change what the FixtureShark FPL weekly email includes.' });
  useNoindex(true);
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [r, setR] = useState<ManageResult | null>(token ? null : { state: 'invalid' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fplId, setFplId] = useState('');
  const [clubId, setClubId] = useState<number | null>(null);

  const apply = (x: ManageResult) => {
    setR(x);
    if (x.state === 'ok') {
      setFplId(x.fpl_id != null ? String(x.fpl_id) : '');
      setClubId(x.club?.id ?? null);
    }
  };

  useEffect(() => {
    if (!token) return;
    let live = true;
    manageEmail(token).then((x) => { if (live) apply(x); });
    return () => { live = false; };
  }, [token]);

  async function save(changes: ManageChanges) {
    setSaving(true);
    setSaved(false);
    const x = await manageEmail(token, changes);
    apply(x);
    setSaving(false);
    setSaved(x.state === 'ok');
  }

  if (!r) return <Shell title="Email choices"><p>One moment.</p></Shell>;
  if (r.state === 'ok') {
    const typed = fplId.trim() === '' ? null : parseFplId(fplId);
    const badId = fplId.trim() !== '' && typed == null;
    return (
      <Shell title="Email choices">
        <p>You get FixtureShark FPL weekly before each FPL deadline.</p>
        <div className="flex items-start gap-2">
          <input id="football-section" type="checkbox" className="mt-1" checked={!!r.football} disabled={saving}
            onChange={(e) => save({ football: e.target.checked })} />
          <label htmlFor="football-section">
            Also include where our model and the betting market disagree on the weekend&rsquo;s games. I&rsquo;m 18 or over.
          </label>
        </div>
        <form
          className="space-y-2 rounded-lg border border-chalk-300 bg-white p-3"
          onSubmit={(e) => { e.preventDefault(); if (!badId) save({ fpl_id: typed, club_id: clubId }); }}
        >
          <p className="font-medium text-ink-900">Your team (optional)</p>
          <EmailPersonalise fplId={fplId} clubId={clubId} clubName={r.club?.name} onFplId={setFplId} onClub={setClubId} active />
          {badId && <p role="alert" className="text-sm text-loss-700">An FPL team ID is a number of up to 8 digits.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving || badId} className="rounded bg-pitch-800 px-4 py-2 font-medium text-chalk-100 hover:bg-pitch-700 disabled:opacity-60">Save</button>
            {(r.fpl_id != null || r.club) && (
              <button type="button" disabled={saving} onClick={() => save({ fpl_id: null, club_id: null })}
                className="rounded border border-chalk-300 px-4 py-2 text-ink-900 hover:border-ink-500">Remove both</button>
            )}
          </div>
          <p className="text-xs text-ink-500">We keep only the ID number and the club, nothing else from your FPL account.</p>
        </form>
        <section className="space-y-2 rounded-lg border border-chalk-300 bg-white p-3" aria-labelledby="watchlist-h">
          <p id="watchlist-h" className="font-medium text-ink-900">Watchlist (optional)</p>
          <p className="text-xs text-ink-500">Players you&rsquo;re thinking of bringing in. Each email reports their price, fitness, start chance, fixtures and form.</p>
          <EmailWatchlist players={r.watchlist ?? []} disabled={saving}
            onChange={(next: WatchPlayer[]) => save({ watchlist: next.map((x) => x.id) })} />
        </section>
        {saved && <p role="status" className="text-ink-900">Saved.</p>}
        <p><Link to={`/email/unsubscribe?t=${token}`} className={LINK}>Unsubscribe from everything</Link></p>
        {BACK}
      </Shell>
    );
  }
  if (r.state === 'unsubscribed') {
    return <Shell title="Email choices"><p>This address is unsubscribed. <Link to="/fpl/start" className={LINK}>Sign up again</Link> any time.</p>{BACK}</Shell>;
  }
  if (r.state === 'error') {
    return <Shell title="Something went wrong"><p>We couldn&rsquo;t load your choices just now. Please try again in a minute.</p>{BACK}</Shell>;
  }
  return <Shell title="Link not recognised"><p>Use the &ldquo;Change what you get&rdquo; link in your most recent email.</p>{BACK}</Shell>;
}
