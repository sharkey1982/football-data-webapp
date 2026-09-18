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
          : 'Model configuration is admin-only. Viewing is public; editing needs an admin sign-in.'}{' '}
        {!session && (
          <Link to="/login" className="text-pitch-800 underline underline-offset-2">
            Sign in
          </Link>
        )}
      </p>
    </div>
  );
}
