// ============================================================================
// scripts/test-joins.ts
//
// One-off diagnostic: confirms the PostgREST nested-select join syntax used
// throughout src/lib/api.ts actually works against the real database before
// we build pages on top of it. Run with the publishable key (same one the
// frontend will use), not the secret key -- we want to test exactly what
// the deployed app will experience, including RLS.
//
// Usage: npx tsx scripts/test-joins.ts
// ============================================================================

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('--- Test 1: basic read (RLS public-read policy) ---');
  const basic = await supabase.from('matches').select('match_id, match_date').limit(3);
  if (basic.error) {
    console.log('❌', basic.error.message);
  } else {
    console.log('✅ Read', basic.data?.length, 'rows. RLS public-read policy is working.');
  }

  console.log('\n--- Test 2: nested-select join (home/away team names) ---');
  const joined = await supabase
    .from('matches')
    .select(
      `
      match_id,
      match_date,
      full_time_home_goals,
      full_time_away_goals,
      home_team:teams!matches_home_team_id_fkey(canonical_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name),
      league:leagues(code, name),
      season:seasons(label)
    `
    )
    .order('match_date', { ascending: false })
    .limit(3);

  if (joined.error) {
    console.log('❌', joined.error.message);
    console.log('Full error:', JSON.stringify(joined.error, null, 2));
  } else {
    console.log('✅ Join query succeeded. Sample row:');
    console.log(JSON.stringify(joined.data?.[0], null, 2));
  }

  console.log('\n--- Test 3: head-to-head OR filter across two teams ---');
  const { data: anyTwoTeams } = await supabase.from('teams').select('team_id, canonical_name').limit(2);
  if (anyTwoTeams && anyTwoTeams.length === 2) {
    const [a, b] = anyTwoTeams;
    const h2h = await supabase
      .from('matches')
      .select('match_id')
      .or(
        `and(home_team_id.eq.${a.team_id},away_team_id.eq.${b.team_id}),and(home_team_id.eq.${b.team_id},away_team_id.eq.${a.team_id})`
      )
      .limit(5);
    if (h2h.error) {
      console.log('❌', h2h.error.message);
    } else {
      console.log(`✅ Head-to-head OR-filter query succeeded (${h2h.data?.length ?? 0} rows for "${a.canonical_name}" vs "${b.canonical_name}", may legitimately be 0 if they've never played).`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
