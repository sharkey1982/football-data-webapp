// ============================================================================
// scripts/sync-fixtures.ts
//
// EC (National League) fixture sync, from football-data.co.uk's combined
// all-leagues fixtures.csv (distinct from the season-by-season results
// CSVs import-daily.ts uses -- this one carries every division's
// scheduled matches in one file, keyed by a "Div" column, with no scores
// since these are unplayed). Was originally built to cover all five
// English divisions; narrowed to EC alone after discovering
// refresh_fixture_feeds() (Supabase pg_cron) already keeps E0-E3 and the
// Europeans current from a different source -- this script's real value
// is specifically inserting fixtures that don't exist yet, which that
// job structurally can't do (it only ever updates existing rows).
//
// Two jobs in one pass:
//   1. Fill in fixtures that don't exist yet (this is how EC ended up with
//      zero rows in the fixtures table despite having full match history --
//      nothing had ever populated its schedule).
//   2. Detect a genuine kickoff_date/kickoff_time change on a fixture that
//      DOES already exist -- a postponement or reschedule -- and log it to
//      fixture_changes, which the frontend surfaces as a notification
//      (requested directly: EPL schedule changes affect Fantasy -- EC
//      itself doesn't feed FPL, but the same script handles both jobs for
//      whichever division it's pointed at).
//
// Matching an incoming row to an existing fixture is deliberately NOT by
// the table's own unique constraint (league_id, season_id, kickoff_date,
// home_team_id, away_team_id) -- that constraint includes kickoff_date,
// so a fixture whose date changed would never match its old row via that
// key; it'd silently insert a duplicate instead of being recognised as
// the same fixture with a new date. Matched instead on
// (league_id, season_id, home_team_id, away_team_id) alone, which is
// unique on its own in a standard season (each team hosts each opponent
// at most once) -- this is exactly why the change is detectable at all.
//
// Every run -- success or failure -- writes one row to
// fixture_refresh_runs, mirroring match_import_runs' pattern for the
// Data Health page.
//
// Usage: npx tsx scripts/sync-fixtures.ts
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';

const FIXTURES_CSV_URL = 'https://www.football-data.co.uk/fixtures.csv';
const SOURCE_NAME = 'football-data.co.uk';
const SEASON_LABEL = process.env.SYNC_SEASON_LABEL ?? '2627';
// Scoped to EC specifically -- E0/E1/E2/E3 and the European competitions
// are already kept current by the existing Supabase-native
// refresh_fixture_feeds() (fixturedownload.com, daily at 04:15 UTC), and
// LC/FAC by ingest-cup-data (footballwebpages.co.uk). EC is the one gap
// neither of those closes: refresh_fixture_feeds() only ever UPDATES
// fixtures that already exist, and neither source's competition list
// includes the National League at all -- this is specifically the
// insert-new-rows capability EC needed, not a second updater for
// divisions that already have one.
const TRACKED_DIVISIONS = ['EC'];

const STARTED_AT = new Date().toISOString();

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyRaw] = parts;
  let yyyy = yyRaw;
  if (yyyy.length === 2) {
    const yy = parseInt(yyyy, 10);
    yyyy = String(yy < 50 ? 2000 + yy : 1900 + yy);
  }
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function logRun(
  supabase: SupabaseClient<Database> | null,
  fields: { competitions: string[]; rowsSeen: number | null; rowsUpdated: number | null; status: 'success' | 'failed'; errorMessage: string | null }
) {
  console.log(
    `[fixture_refresh_runs] ${fields.status}${fields.errorMessage ? ` -- ${fields.errorMessage}` : ''} ` +
      `(seen=${fields.rowsSeen ?? '-'}, updated=${fields.rowsUpdated ?? '-'})`
  );
  if (!supabase) return;
  const { error } = await (supabase as any).from('fixture_refresh_runs').insert({
    started_at: STARTED_AT,
    finished_at: new Date().toISOString(),
    competitions: fields.competitions,
    rows_seen: fields.rowsSeen,
    rows_updated: fields.rowsUpdated,
    status: fields.status,
    error_message: fields.errorMessage,
  });
  if (error) console.error('Failed to write fixture_refresh_runs row:', error);
}

// Module-scope, not created inside main() -- the outermost catch handler
// at the bottom of this file needs access to a real client to log an
// unexpected failure, which a main()-local const couldn't provide (this
// is exactly the bug that made the first two live runs of this script
// crash with nothing logged anywhere: the outer catch always called
// logRun(null, ...), and logRun silently skips writing when its client
// argument is null).
let supabase: SupabaseClient<Database> | null = null;

async function fail(client: SupabaseClient<Database> | null, message: string, rowsSeen: number | null = null): Promise<never> {
  console.error(message);
  await logRun(client, { competitions: TRACKED_DIVISIONS, rowsSeen, rowsUpdated: null, status: 'failed', errorMessage: message });
  process.exit(1);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    await fail(null, 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
  }
  supabase = createClient<Database>(url!, key!, { auth: { persistSession: false } });

  console.log(`Fetching ${FIXTURES_CSV_URL} ...`);
  let text: string;
  try {
    const res = await fetch(FIXTURES_CSV_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; football-data-webapp-fixtures-sync/1.0)' },
    });
    if (!res.ok) {
      await fail(supabase, `Failed to download fixtures CSV: ${res.status} ${res.statusText}`);
    }
    text = await res.text();
  } catch (err) {
    await fail(supabase, `Failed to download fixtures CSV: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const allRows = parseCsv(text);
  const rows = allRows.filter((r) => TRACKED_DIVISIONS.includes(r['Div']));
  console.log(`Parsed ${allRows.length} row(s) total, ${rows.length} in tracked divisions (${TRACKED_DIVISIONS.join(', ')}).`);

  const { data: leagues, error: leagueErr } = await supabase.from('leagues').select('league_id, code').in('code', TRACKED_DIVISIONS);
  if (leagueErr || !leagues) {
    await fail(supabase, `Could not load leagues: ${leagueErr?.message ?? 'not found'}`, rows.length);
  }
  const leagueIdByCode = new Map<string, number>((leagues ?? []).map((l) => [l.code, l.league_id]));

  const { data: season, error: seasonErr } = await supabase.from('seasons').select('season_id').eq('label', SEASON_LABEL).single();
  if (seasonErr || !season) {
    await fail(supabase, `Could not find season with label "${SEASON_LABEL}": ${seasonErr?.message ?? 'not found'}`, rows.length);
  }

  const { data: aliases, error: aliasErr } = await supabase.from('team_aliases').select('team_id, raw_name').eq('source_name', SOURCE_NAME);
  if (aliasErr) {
    await fail(supabase, `Could not load team_aliases: ${aliasErr.message}`, rows.length);
  }
  const teamIdByRawName = new Map<string, number>((aliases ?? []).map((a) => [a.raw_name, a.team_id]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const leagueId = leagueIdByCode.get(row['Div']);
    const kickoffDate = toIsoDate(row['Date']);
    const homeTeamId = teamIdByRawName.get(row['HomeTeam']);
    const awayTeamId = teamIdByRawName.get(row['AwayTeam']);
    const kickoffTime = row['Time'] ? `${row['Time']}:00` : null;

    if (!leagueId || !kickoffDate || !homeTeamId || !awayTeamId) {
      skipped.push(`${row['Div']}: ${row['HomeTeam']} vs ${row['AwayTeam']} on ${row['Date']} -- missing league/date/team mapping`);
      continue;
    }

    const { data: existing, error: findErr } = await (supabase as any)
      .from('fixtures')
      .select('fixture_id, kickoff_date, kickoff_time')
      .eq('league_id', leagueId)
      .eq('season_id', (season as any).season_id)
      .eq('home_team_id', homeTeamId)
      .eq('away_team_id', awayTeamId)
      .maybeSingle();
    if (findErr) {
      errors.push(`${row['Div']}: ${row['HomeTeam']} vs ${row['AwayTeam']} -- lookup failed: ${findErr.message}`);
      continue;
    }

    if (!existing) {
      const { error: insertErr } = await (supabase as any).from('fixtures').insert({
        league_id: leagueId,
        season_id: (season as any).season_id,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_date: kickoffDate,
        kickoff_time: kickoffTime,
        matchweek: null,
        status: 'scheduled',
        source_name: SOURCE_NAME,
        source_file: FIXTURES_CSV_URL,
      });
      if (insertErr) {
        errors.push(`${row['Div']}: ${row['HomeTeam']} vs ${row['AwayTeam']} -- insert failed: ${insertErr.message}`);
      } else {
        inserted++;
      }
      continue;
    }

    const dateChanged = existing.kickoff_date !== kickoffDate;
    const timeChanged = (existing.kickoff_time ?? null) !== (kickoffTime ?? null);
    if (!dateChanged && !timeChanged) {
      unchanged++;
      continue;
    }

    const { error: updateErr } = await (supabase as any)
      .from('fixtures')
      .update({ kickoff_date: kickoffDate, kickoff_time: kickoffTime })
      .eq('fixture_id', existing.fixture_id);
    if (updateErr) {
      errors.push(`${row['Div']}: ${row['HomeTeam']} vs ${row['AwayTeam']} -- update failed: ${updateErr.message}`);
      continue;
    }

    const { error: changeLogErr } = await (supabase as any).from('fixture_changes').insert({
      fixture_id: existing.fixture_id,
      old_kickoff_date: existing.kickoff_date,
      new_kickoff_date: kickoffDate,
      old_kickoff_time: existing.kickoff_time,
      new_kickoff_time: kickoffTime,
    });
    if (changeLogErr) {
      // The fixture itself was updated correctly -- only the notification
      // record failed. Not worth failing the whole run over, but surface
      // it so it doesn't disappear silently.
      console.error(`Fixture ${existing.fixture_id} updated but failed to log the change: ${changeLogErr.message}`);
    }
    updated++;
  }

  if (skipped.length > 0) {
    console.warn(`\u26a0\ufe0f  ${skipped.length} row(s) skipped -- missing mapping:`);
    skipped.forEach((s) => console.warn('  -', s));
  }
  if (errors.length > 0) {
    console.error(`\u274c ${errors.length} row(s) failed:`);
    errors.forEach((e) => console.error('  -', e));
  }

  console.log(`\u2705 ${inserted} inserted, ${updated} updated (kickoff changed), ${unchanged} unchanged.`);

  const status = errors.length > 0 ? 'failed' : 'success';
  await logRun(supabase, {
    competitions: TRACKED_DIVISIONS,
    rowsSeen: rows.length,
    rowsUpdated: inserted + updated,
    status,
    errorMessage: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
  });
  if (status === 'failed') process.exit(1);
}

main().catch(async (err) => {
  console.error('Unexpected error:', err);
  await logRun(supabase, {
    competitions: TRACKED_DIVISIONS,
    rowsSeen: null,
    rowsUpdated: null,
    status: 'failed',
    errorMessage: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
