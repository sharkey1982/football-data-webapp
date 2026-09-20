// ============================================================================
// src/lib/supabase.ts
//
// Frontend Supabase client. Uses ONLY the publishable key (never the secret
// key -- that's importer-only, server-side, see src/importer/run.ts in the
// project root).
//
// This header previously claimed "there are no write policies for
// anon/authenticated, so this client can only ever read". That was FALSE,
// and being stated as a verified safety property is probably why it went
// unnoticed: six tables (team_strength_manual_override,
// team_player_tactical_defaults, fpl_player_squad_state,
// team_finishing_position_projection, team_tactical_review_log and
// set_piece_hierarchies) had RLS disabled or a public write policy plus
// write grants to anon. Confirmed exploitable by writing a fake +99
// strength override as the anon role, which would have propagated through
// backfill_fixture_predictions() into every fixture prediction, FPL
// projection and optimal squad.
//
// Now genuinely true: all six have RLS enabled with public SELECT and
// admin-only writes (see public.is_admin() / public.app_users). Writes
// from this client require an authenticated session flagged is_admin;
// the pipelines are unaffected because service_role bypasses RLS.
// Don't restate a security property here without re-checking it.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Check your .env.local file (see SETUP.md).'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    // persistSession was FALSE, which made signing in impossible to
    // complete: supabase-js kept the session in memory only, so a
    // successful password grant left no stored session, getSession()
    // came back empty on the next render, and the app showed you as
    // signed out again. The admin session never survived the round
    // trip.
    persistSession: true,
    // Needed for the magic-link callback: the session arrives in the
    // URL fragment when the emailed link is followed, and without this
    // the client never reads it, so the link appears to do nothing.
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});
