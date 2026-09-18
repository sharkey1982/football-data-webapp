// ============================================================================
// src/lib/auth.tsx
//
// Session + admin state for the whole app.
//
// Exists because model-configuration writes are now admin-only at the
// database level (see the RLS policies behind public.is_admin()). This
// is the frontend half of that: it tells the UI whether the current
// visitor can write, so Configure pages can show edit controls instead
// of letting someone try an edit that the database will silently reject.
//
// isAdmin is read from app_users via the session, NOT trusted from
// anything client-side. That matters: this flag only controls what the
// UI OFFERS. It is not the security boundary -- RLS is. If this were
// spoofed, the writes would still fail server-side, which is exactly
// the property that makes it safe to make UI decisions from.
// ============================================================================

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  isAdmin: boolean;
  /** True until the initial session check completes -- so the UI can avoid
   * flashing a signed-out state for an already-signed-in admin. */
  loading: boolean;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolveAdmin(s: Session | null) {
      if (!s) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      // Ask the database, rather than reading anything from the token --
      // is_admin() is the same function the RLS policies use, so the UI
      // and the security boundary can never disagree about who's an admin.
      const { data, error } = await (supabase as any).rpc('is_admin');
      if (!cancelled) setIsAdmin(!error && data === true);
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await resolveAdmin(data.session);
      if (!cancelled) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (cancelled) return;
      setSession(s);
      await resolveAdmin(s);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      isAdmin,
      loading,
      async signInWithEmail(email: string) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        return { error: error?.message ?? null };
      },
      // Password sign-in exists alongside the magic link because the
      // magic link depends on outbound email, and Supabase's default
      // SMTP is heavily rate-limited (and Hotmail junks it). Needing
      // working email in order to fix anything is a bad dependency for
      // the one account that administers the site.
      async signInWithPassword(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async updatePassword(password: string) {
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, isAdmin, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}

/** Non-throwing variant, for components that merely REPORT auth state
 * rather than depend on it -- e.g. the read-only notice on Configure
 * pages. Those are purely informational (the real boundary is RLS), so a
 * missing provider should make them render nothing, not crash the page
 * they're embedded in. useAuth stays strict for everything that
 * genuinely needs a session, so this doesn't weaken the guarantee where
 * it matters. */
export function useAuthOptional(): AuthState | null {
  return useContext(AuthContext);
}
