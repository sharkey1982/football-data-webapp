// ============================================================================
// src/lib/supabase.ts
//
// Frontend Supabase client. Uses ONLY the publishable key (never the secret
// key -- that's importer-only, server-side, see src/importer/run.ts in the
// project root). Reads are governed by the RLS "Public read access" policies
// from supabase/migrations/0002_grants_and_rls.sql; there are no write
// policies for anon/authenticated, so this client can only ever read.
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
  auth: { persistSession: false },
});
