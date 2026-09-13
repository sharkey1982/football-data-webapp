// ============================================================================
// scripts/refresh-predictions.ts
//
// Calls the existing backfill_fixture_predictions() Postgres function,
// which recomputes predicted_home_goals/predicted_away_goals for every
// fixture with status IN (scheduled, postponed), using each league's
// LATEST model_fit_run. Never touches fixtures with status = 'played' --
// that's enforced inside the SQL function itself, not here.
//
// Run this after a model fit writes new team_ratings, so future fixtures
// pick up the new fit_run_id rather than being stuck on stale predictions.
//
// Usage: npx tsx scripts/refresh-predictions.ts
// ============================================================================

import { createClient } from '@supabase/supabase-js';

// Deliberately untyped (no <Database> generic): the generated Database type
// has Functions: Record<string, never> since these Postgres functions were
// added directly via migration rather than through the codegen flow, so a
// typed client would reject any .rpc() call by construction.
async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('Calling backfill_fixture_predictions()...');
  const { data, error } = await supabase.rpc('backfill_fixture_predictions');
  if (error) {
    console.error('backfill_fixture_predictions() failed:', error);
    process.exit(1);
  }

  console.log(`\u2705 Updated ${data} fixture(s) with fresh predictions.`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
