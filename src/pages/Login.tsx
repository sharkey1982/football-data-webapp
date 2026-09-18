// ============================================================================
// src/pages/Login.tsx
//
// Magic-link sign-in. Chosen over email+password deliberately: there's no
// password to store, reset, or leak, and for a site with a handful of
// admin users the emailed-link round trip is a fine trade.
//
// This page grants nothing by itself. Signing in creates an app_users row
// with is_admin FALSE; only a deliberate manual promotion makes someone
// an admin. So this being public is not a risk -- a stranger signing in
// gets exactly the permissions they had while signed out.
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useDocumentHead } from '../hooks/useDocumentHead';

export default function Login() {
  const { session, isAdmin, loading, signInWithEmail, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useDocumentHead({ title: 'Sign in', description: 'Sign in to manage model configuration.', path: '/login' });

  async function handleSubmit() {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await signInWithEmail(email.trim());
    setSubmitting(false);
    if (err) setError(err);
    else setSent(true);
  }

  if (loading) return <p className="text-ink-500 font-mono text-sm">Checking session&hellip;</p>;

  if (session) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Signed in</h1>
        <p className="text-ink-700">
          {session.user.email}
          {isAdmin ? (
            <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide bg-pitch-800 text-chalk-100">
              Admin
            </span>
          ) : (
            <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide bg-chalk-300 text-ink-700">
              Read-only
            </span>
          )}
        </p>
        {!isAdmin && (
          <p className="text-sm text-ink-500">
            This account isn&rsquo;t an admin, so model configuration stays read-only. Admin access is granted manually,
            not by signing up.
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={signOut}
            className="text-sm border border-chalk-300 rounded px-3 py-1.5 hover:bg-chalk-200 transition-colors"
          >
            Sign out
          </button>
          <Link to="/" className="text-sm text-pitch-800 underline underline-offset-2 self-center">
            Back to the site
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Sign in</h1>
      {sent ? (
        <p className="text-ink-700">
          Check <strong>{email}</strong> for a sign-in link. It opens this page back up, already signed in.
        </p>
      ) : (
        <>
          <p className="text-ink-700 text-sm">
            Sign-in is only needed to edit model configuration. Everything else on the site is public and needs no account.
          </p>
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </label>
          {error && <p className="text-sm text-loss-700">{error}</p>}
          <button
            type="button"
            disabled={submitting || !email.trim()}
            onClick={handleSubmit}
            className="text-sm bg-pitch-800 text-chalk-100 rounded px-4 py-2 hover:bg-pitch-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Sending\u2026' : 'Email me a sign-in link'}
          </button>
        </>
      )}
    </div>
  );
}
