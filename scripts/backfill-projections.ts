// ============================================================================
// scripts/backfill-projections.ts
//
// Populates baseline leaguewide_v6 player projections for every scheduled
// EPL fixture that doesn't already have them, one fixture at a time.
//
// WHY A BACKGROUND JOB RATHER THAN A SQL BATCH: generation costs ~23s per
// fixture (measured live). A single SQL statement covering many fixtures
// hits Supabase's statement timeout; the cost is dominated by
// fpl_fixture_bps_projection_v1's nested window functions, which the
// planner can't scope down to one fixture (the same structural pattern
// found in several other views in this project). Rewriting that whole
// generation chain is deep, risky work -- but it isn't NEEDED to populate
// the season, because a GitHub Actions job has no statement timeout and a
// 6-hour ceiling. 270 fixtures x ~23s is roughly 105 minutes, which fits
// comfortably. The chain optimisation remains worth doing separately; this
// unblocks full-season coverage without betting on it.
//
// Safe to re-run: skips fixtures that already have projections unless
// --force is passed, and commits each fixture independently so a failure
// part-way through keeps everything already generated.
//
// Usage:
//   npx tsx scripts/backfill-projections.ts              # all missing fixtures
//   npx tsx scripts/backfill-projections.ts --from 12 --to 20
//   npx tsx scripts/backfill-projections.ts --force --from 5 --to 11
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const SEASON_ID = 13;
const LEAGUE_ID = 1;
const MODEL_VERSION = 'leaguewide_v6';
const SCENARIO_KEY = 'baseline';

// Generation is ~23s/fixture; a slow fixture shouldn't stall the whole run.
const PER_FIXTURE_TIMEOUT_MS = 120_000;
// Leave headroom under the GitHub Actions 6h job ceiling so the run always
// finishes cleanly (reporting what it did) rather than being killed mid-flight.
const OVERALL_BUDGET_MS = 5 * 60 * 60 * 1000;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  };
  return {
    force: args.includes('--force'),
    from: get('--from') ? Number(get('--from')) : null,
    to: get('--to') ? Number(get('--to')) : null,
  };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
    process.exit(1);
  }
  const { force, from, to } = parseArgs();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Which matchweeks already have coverage -- so we can skip them by default
  // rather than regenerating hundreds of fixtures unnecessarily.
  const { data: coveredData, error: coveredErr } = await supabase.rpc('get_fpl_projection_available_matchweeks', {
    p_season_id: SEASON_ID, p_league_id: LEAGUE_ID, p_model_version: MODEL_VERSION, p_scenario_key: SCENARIO_KEY,
  });
  if (coveredErr) { console.error('Failed to read existing coverage:', coveredErr); process.exit(1); }
  const covered = new Set<number>((coveredData ?? []) as number[]);
  console.log(`Existing coverage: ${covered.size ? [...covered].sort((a, b) => a - b).join(',') : '(none)'}`);

  let query = supabase
    .from('fixtures')
    .select('fixture_id, matchweek')
    .eq('league_id', LEAGUE_ID)
    .eq('season_id', SEASON_ID)
    .not('predicted_home_goals', 'is', null)
    .order('matchweek', { ascending: true })
    .order('fixture_id', { ascending: true });
  if (from !== null) query = query.gte('matchweek', from);
  if (to !== null) query = query.lte('matchweek', to);

  const { data: fixturesData, error: fixtureErr } = await query;
  if (fixtureErr || !fixturesData) { console.error('Failed to load fixtures:', fixtureErr); process.exit(1); }
  const fixtures = fixturesData as { fixture_id: number; matchweek: number }[];

  const targets = fixtures.filter((f: any) => force || !covered.has(f.matchweek));
  console.log(`${fixtures.length} fixture(s) in range; ${targets.length} to generate${force ? ' (--force)' : ' (skipping already-covered matchweeks)'}.`);
  if (targets.length === 0) { console.log('Nothing to do.'); return; }

  const started = Date.now();
  let ok = 0, failed = 0;
  const failures: { fixture_id: number; matchweek: number; error: string }[] = [];

  for (const [i, f] of targets.entries()) {
    if (Date.now() - started > OVERALL_BUDGET_MS) {
      console.log(`\nStopping: hit the ${OVERALL_BUDGET_MS / 3600000}h time budget with ${targets.length - i} fixture(s) left. Re-run to continue -- already-generated fixtures are skipped automatically.`);
      break;
    }
    const t0 = Date.now();
    try {
      const call = supabase.rpc('refresh_fpl_projection_fixture_v6', { p_fixture_id: f.fixture_id });
      const timeout = new Promise((_r, rej) => setTimeout(() => rej(new Error(`timed out after ${PER_FIXTURE_TIMEOUT_MS}ms`)), PER_FIXTURE_TIMEOUT_MS));
      const { data, error } = (await Promise.race([call, timeout])) as any;
      if (error) throw error;
      ok++;
      console.log(`[${i + 1}/${targets.length}] GW${f.matchweek} fixture ${f.fixture_id}: ${data} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e: any) {
      failed++;
      const msg = e?.message ?? String(e);
      failures.push({ fixture_id: f.fixture_id, matchweek: f.matchweek, error: msg });
      // Keep going: one bad fixture shouldn't cost the whole run.
      console.error(`[${i + 1}/${targets.length}] GW${f.matchweek} fixture ${f.fixture_id}: FAILED -- ${msg}`);
    }
  }

  console.log(`\nGenerated ${ok}, failed ${failed}, in ${((Date.now() - started) / 60000).toFixed(1)} min.`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  GW${f.matchweek} fixture ${f.fixture_id}: ${f.error}`);
  }

  // Post-run validation -- report what's actually true now rather than
  // assuming the writes landed.
  const { data: after, error: afterErr } = await supabase.rpc('get_fpl_projection_available_matchweeks', {
    p_season_id: SEASON_ID, p_league_id: LEAGUE_ID, p_model_version: MODEL_VERSION, p_scenario_key: SCENARIO_KEY,
  });
  if (!afterErr && after) {
    const mws = (after as number[]).slice().sort((a, b) => a - b);
    console.log(`Coverage now: GW${mws[0]}-${mws[mws.length - 1]} (${mws.length} matchweeks)`);
  }

  if (failed > 0 && ok === 0) process.exit(1); // everything failed -- genuinely broken, not partial progress
}

main().catch((e) => {
  console.error('backfill-projections.ts failed:', e);
  process.exit(1);
});
