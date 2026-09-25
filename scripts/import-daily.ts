// ============================================================================
// scripts/import-daily.ts
//
// Daily re-import of the current Premier League season CSV from
// football-data.co.uk. Downloads the season file fresh each run, maps team
// names to team_id via team_aliases, and upserts into matches on the
// natural key (league_id, season_id, match_date, home_team_id, away_team_id)
// -- so re-runs are idempotent. Newly played matches get inserted; rows
// already in the DB get their stats refreshed if the source file corrected
// them (e.g. late-added referee, corrected card counts).
//
// Every run -- success or failure -- writes one row to match_import_runs
// (started_at/finished_at, rows_seen from the CSV, rows_upserted into
// matches, status, error_message) so the Data Health page can show how
// many results were actually added, not just that the job ran.
//
// Uses the service_role key (bypasses RLS) since this only ever runs
// server-side, via GitHub Actions. Never expose SUPABASE_SERVICE_KEY to the
// frontend or commit it to the repo -- it's read from env / Actions secrets.
//
// Usage: npx tsx scripts/import-daily.ts
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, MatchInsert, MatchResult } from '../src/types/database';
import { csvUrlFor, selectRows } from './lib/footballDataCsv';

const LEAGUE_CODE = process.env.IMPORT_LEAGUE_CODE ?? 'E0';
const SEASON_LABEL = process.env.IMPORT_SEASON_LABEL ?? '2627';
// Workflows may pass the URL explicitly; otherwise it's derived from the
// league code (3-letter codes are football-data.co.uk's all-seasons files).
const CSV_URL = process.env.IMPORT_CSV_URL || csvUrlFor(LEAGUE_CODE, SEASON_LABEL);
const SOURCE_NAME = 'football-data.co.uk';

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
  // Handles trailing blank lines, which football-data.co.uk CSVs commonly have.
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

function toIntOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toResult(raw: string | undefined): MatchResult | null {
  if (raw === 'H' || raw === 'D' || raw === 'A') return raw;
  return null;
}

async function logRun(
  supabase: SupabaseClient<Database> | null,
  fields: { rowsSeen: number | null; rowsUpserted: number | null; status: 'success' | 'failed'; errorMessage: string | null }
) {
  console.log(
    `[match_import_runs] ${fields.status}${fields.errorMessage ? ` -- ${fields.errorMessage}` : ''} ` +
      `(seen=${fields.rowsSeen ?? '-'}, upserted=${fields.rowsUpserted ?? '-'})`
  );
  if (!supabase) return; // no DB connection to log to (e.g. missing env vars) -- console output is all we have
  const { error } = await supabase.from('match_import_runs').insert({
    started_at: STARTED_AT,
    finished_at: new Date().toISOString(),
    league_code: LEAGUE_CODE,
    rows_seen: fields.rowsSeen,
    rows_upserted: fields.rowsUpserted,
    status: fields.status,
    error_message: fields.errorMessage,
  });
  if (error) console.error('Failed to write match_import_runs row:', error);
}

async function fail(supabase: SupabaseClient<Database> | null, message: string, rowsSeen: number | null = null): Promise<never> {
  console.error(message);
  await logRun(supabase, { rowsSeen, rowsUpserted: null, status: 'failed', errorMessage: message });
  process.exit(1);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    await fail(null, 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
  }

  const supabase = createClient<Database>(url!, key!, { auth: { persistSession: false } });

  console.log(`Fetching ${CSV_URL} ...`);
  let text: string;
  try {
    const res = await fetch(CSV_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; football-data-webapp-importer/1.0)' },
    });
    if (!res.ok) {
      await fail(supabase, `Failed to download CSV: ${res.status} ${res.statusText}`);
    }
    text = await res.text();
  } catch (err) {
    await fail(supabase, `Failed to download CSV: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  let format: string;
  let selected: ReturnType<typeof selectRows>['selected'];
  let excluded: ReturnType<typeof selectRows>['excluded'];
  try {
    ({ format, selected, excluded } = selectRows(parseCsv(text), SEASON_LABEL));
  } catch (err) {
    await fail(supabase, err instanceof Error ? err.message : String(err));
    return;
  }
  // rows_seen counts only the season(s) being imported -- an extra-league
  // file holds every season since ~2012.
  const rows = [...selected, ...excluded];
  console.log(`Parsed ${rows.length} row(s) for ${SEASON_LABEL} from ${format}-format source file.`);

  const { data: league, error: leagueErr } = await supabase
    .from('leagues')
    .select('league_id')
    .eq('code', LEAGUE_CODE)
    .single();
  if (leagueErr || !league) {
    await fail(supabase, `Could not find league with code "${LEAGUE_CODE}": ${leagueErr?.message ?? 'not found'}`, rows.length);
  }

  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('season_id')
    .eq('label', SEASON_LABEL)
    .single();
  if (seasonErr || !season) {
    await fail(supabase, `Could not find season with label "${SEASON_LABEL}": ${seasonErr?.message ?? 'not found'}`, rows.length);
  }
  // Other labels only arise from a calendar-year league's next season (see
  // footballDataCsv.ts). A label with no seasons row yet is skipped and
  // reported, not a failure -- the current season still imports.
  const seasonIdByLabel = new Map<string, number>([[SEASON_LABEL, season!.season_id]]);
  const otherLabels = [...new Set(rows.map((r) => r.seasonLabel))].filter((l) => l !== SEASON_LABEL);
  if (otherLabels.length > 0) {
    const { data: others } = await supabase.from('seasons').select('season_id, label').in('label', otherLabels);
    for (const o of others ?? []) seasonIdByLabel.set(o.label, o.season_id);
  }

  const { data: aliases, error: aliasErr } = await supabase
    .from('team_aliases')
    .select('team_id, raw_name')
    .eq('source_name', SOURCE_NAME);
  if (aliasErr) {
    await fail(supabase, `Could not load team_aliases: ${aliasErr.message}`, rows.length);
  }
  const teamIdByRawName = new Map<string, number>();
  for (const a of aliases ?? []) teamIdByRawName.set(a.raw_name, a.team_id);

  const inserts: MatchInsert[] = [];
  const skipped: string[] = excluded.map(
    ({ row, reason }) => `${row.HomeTeam} vs ${row.AwayTeam} on ${toIsoDate(row.Date) ?? row.Date} -- ${reason}`
  );

  for (const { row, seasonLabel } of selected) {
    const matchDate = toIsoDate(row['Date']);
    const homeTeam = row['HomeTeam'];
    const awayTeam = row['AwayTeam'];
    const ftr = toResult(row['FTR']);
    const fthg = toIntOrNull(row['FTHG']);
    const ftag = toIntOrNull(row['FTAG']);

    if (!matchDate || !homeTeam || !awayTeam || ftr === null || fthg === null || ftag === null) {
      // Unplayed fixture (blank score) or a malformed trailing row -- skip silently.
      continue;
    }

    const seasonId = seasonIdByLabel.get(seasonLabel);
    if (!seasonId) {
      skipped.push(`${homeTeam} vs ${awayTeam} on ${matchDate} -- season ${seasonLabel} not in seasons table yet`);
      continue;
    }

    const homeTeamId = teamIdByRawName.get(homeTeam);
    const awayTeamId = teamIdByRawName.get(awayTeam);
    if (!homeTeamId || !awayTeamId) {
      skipped.push(`${homeTeam} vs ${awayTeam} on ${matchDate} -- no team_aliases mapping for one or both teams`);
      continue;
    }

    inserts.push({
      league_id: league!.league_id,
      season_id: seasonId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: matchDate,
      kickoff_time: row['Time'] ? `${row['Time']}:00` : null,
      referee: row['Referee'] || null,
      full_time_home_goals: fthg,
      full_time_away_goals: ftag,
      full_time_result: ftr,
      half_time_home_goals: toIntOrNull(row['HTHG']),
      half_time_away_goals: toIntOrNull(row['HTAG']),
      half_time_result: toResult(row['HTR']),
      home_shots: toIntOrNull(row['HS']),
      away_shots: toIntOrNull(row['AS']),
      home_shots_on_target: toIntOrNull(row['HST']),
      away_shots_on_target: toIntOrNull(row['AST']),
      home_corners: toIntOrNull(row['HC']),
      away_corners: toIntOrNull(row['AC']),
      home_fouls: toIntOrNull(row['HF']),
      away_fouls: toIntOrNull(row['AF']),
      home_yellow_cards: toIntOrNull(row['HY']) ?? 0,
      away_yellow_cards: toIntOrNull(row['AY']) ?? 0,
      home_red_cards: toIntOrNull(row['HR']) ?? 0,
      away_red_cards: toIntOrNull(row['AR']) ?? 0,
      source_name: SOURCE_NAME,
      source_file: CSV_URL,
    });
  }

  // Skips stay a success (one unknown club mustn't block a league's other
  // results) but are recorded on the run, not just in the Actions log -- a
  // club renamed mid-season or a play-off against a lower-division side
  // shows up here. Play-off rows are deliberately left unmapped so they
  // never enter a league table.
  const skipNote =
    skipped.length > 0 ? `${skipped.length} played row(s) skipped: ${skipped.slice(0, 10).join('; ')}${skipped.length > 10 ? ' ...' : ''}` : null;
  if (skipped.length > 0) {
    console.warn(`\u26a0\ufe0f  ${skipped.length} row(s) skipped:`);
    skipped.forEach((s) => console.warn('  -', s));
  }

  if (inserts.length === 0) {
    console.log('No complete match rows to upsert. Done.');
    await logRun(supabase, { rowsSeen: rows.length, rowsUpserted: 0, status: 'success', errorMessage: skipNote });
    return;
  }

  console.log(`Upserting ${inserts.length} match row(s)...`);
  const { error: upsertErr, count } = await supabase
    .from('matches')
    .upsert(inserts, {
      onConflict: 'league_id,season_id,match_date,home_team_id,away_team_id',
      count: 'exact',
    });

  if (upsertErr) {
    await fail(supabase, `Upsert failed: ${upsertErr.message}`, rows.length);
  }

  const rowsUpserted = count ?? inserts.length;
  console.log(`\u2705 Upserted ${rowsUpserted} row(s).`);
  await logRun(supabase, { rowsSeen: rows.length, rowsUpserted, status: 'success', errorMessage: skipNote });
}

main().catch(async (err) => {
  console.error('Unexpected error:', err);
  await logRun(null, {
    rowsSeen: null,
    rowsUpserted: null,
    status: 'failed',
    errorMessage: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
