// ============================================================================
// scripts/test-ratings.ts
//
// Verifies the model_fit_runs / team_ratings queries (added for the
// Dixon-Coles Prediction Centre) work correctly against the real database,
// including the team_ratings <-> teams join.
//
// Usage: npx tsx scripts/test-ratings.ts
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

  console.log('--- Test 1: leagues with a fit run ---');
  const { data: leagues } = await supabase.from('leagues').select('league_id, code, name');
  for (const league of leagues ?? []) {
    const { data: fitRun, error } = await supabase
      .from('model_fit_runs')
      .select('*')
      .eq('league_id', league.league_id)
      .eq('converged', true)
      .order('fitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log(`❌ ${league.code}: ${error.message}`);
      continue;
    }
    if (!fitRun) {
      console.log(`⚠️  ${league.code}: no fit run found`);
      continue;
    }
    console.log(
      `✅ ${league.code} (${league.name}): fit_run_id=${fitRun.fit_run_id}, rho=${fitRun.rho.toFixed(4)}, home_adv=${fitRun.home_advantage.toFixed(4)}`
    );
  }

  console.log('\n--- Test 2: team_ratings join (Premier League) ---');
  const { data: e0 } = await supabase.from('leagues').select('league_id').eq('code', 'E0').single();
  const { data: e0Fit } = await supabase
    .from('model_fit_runs')
    .select('fit_run_id')
    .eq('league_id', e0!.league_id)
    .order('fitted_at', { ascending: false })
    .limit(1)
    .single();

  const { data: ratings, error: ratingsError } = await supabase
    .from('team_ratings')
    .select('team_id, attack_strength, defence_strength, is_estimated, team:teams!team_ratings_team_id_fkey(canonical_name)')
    .eq('fit_run_id', e0Fit!.fit_run_id);

  if (ratingsError) {
    console.log('❌', ratingsError.message);
  } else {
    console.log(`✅ Got ${ratings?.length} team ratings for fit_run_id=${e0Fit!.fit_run_id}`);
    const top3 = [...(ratings ?? [])].sort((a: any, b: any) => b.attack_strength - a.attack_strength).slice(0, 3);
    for (const r of top3 as any[]) {
      console.log(`   ${r.team?.canonical_name}: attack=${r.attack_strength.toFixed(3)} defence=${r.defence_strength.toFixed(3)}`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
