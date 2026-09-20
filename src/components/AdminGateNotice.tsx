// ============================================================================
// src/components/AdminGateNotice.tsx
//
// Shown at the top of Configure pages when the current visitor can't
// write. Purely informational -- it hides nothing and enforces nothing.
//
// That's deliberate. The security boundary is RLS, not this component;
// writes from a non-admin fail at the database regardless of what the UI
// shows. What this fixes is the UX consequence of that: without it, a
// signed-out visitor sees edit controls, tries an edit, and gets an
// opaque permission error. Telling them up front is honest about what
// they can do, without pretending the UI is what's protecting anything.
// ============================================================================

import { Link } from 'react-router-dom';
import { useAuthOptional } from '../lib/auth';

export function AdminGateNotice() {
  const auth = useAuthOptional();

  // No provider (e.g. a page rendered in isolation): render nothing
  // rather than crash -- this notice informs, it doesn't protect.
  if (!auth) return null;
  const { session, isAdmin, loading } = auth;

  // Don't flash a "read-only" warning at an admin while their session is
  // still resolving.
  if (loading || isAdmin) return null;

  return (
    <div className="border border-amber-500 bg-amber-500/10 rounded-lg px-4 py-3 mb-4">
      <p className="font-mono text-xs text-amber-700 uppercase tracking-widest">Read-only</p>
      <p className="text-sm text-ink-900 mt-1">
        {session
          ? 'This account isn\u2019t an admin, so model configuration can\u2019t be changed here. Admin access is granted manually.'
          : 'Model configuration is admin-only. Viewing is public; editing needs an admin sign-in.'}
      </p>
      {/* A button, not a text link buried at the end of a sentence.
          The sign-in form lives only at /login and nothing else in the
          app links to it, so this is the single route in -- easy to
          read past when it's three underlined words. */}
      {!session && (
        <Link
          to="/login"
          className="inline-block mt-2 text-sm bg-pitch-800 text-chalk-100 rounded px-3 py-1.5 hover:bg-pitch-700 transition-colors"
        >
          Sign in to edit
        </Link>
      )}
    </div>
  );
}
