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
// Uses the service_role key (bypasses RLS) since this only ever runs
// server-side, via GitHub Actions. Never expose SUPABASE_SERVICE_KEY to the
// frontend or commit it to the repo -- it's read from env / Actions secrets.
//
// Usage: npx tsx scripts/import-daily.ts
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database, MatchInsert, MatchResult } from '../src/types/database';

const CSV_URL = process.env.IMPORT_CSV_URL ?? 'https://football-data.co.uk/mmz4281/2627/E0.csv';
const LEAGUE_CODE = process.env.IMPORT_LEAGUE_CODE ?? 'E0';
const SEASON_LABEL = process.env.IMPORT_SEASON_LABEL ?? '2627';
const SOURCE_NAME = 'football-data.co.uk';

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

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
    process.exit(1);
  }

  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  console.log(`Fetching ${CSV_URL} ...`);
  const res = await fetch(CSV_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; football-data-webapp-importer/1.0)',
    },
  });
  if (!res.ok) {
    console.error(`Failed to download CSV: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} row(s) from source file.`);

  const { data: league, error: leagueErr } = await supabase
    .from('leagues')
    .select('league_id')
    .eq('code', LEAGUE_CODE)
    .single();
  if (leagueErr || !league) {
    console.error(`Could not find league with code "${LEAGUE_CODE}":`, leagueErr);
    process.exit(1);
  }

  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('season_id')
    .eq('label', SEASON_LABEL)
    .single();
  if (seasonErr || !season) {
    console.error(`Could not find season with label "${SEASON_LABEL}":`, seasonErr);
    process.exit(1);
  }

  const { data: aliases, error: aliasErr } = await supabase
    .from('team_aliases')
    .select('team_id, raw_name')
    .eq('source_name', SOURCE_NAME);
  if (aliasErr) {
    console.error('Could not load team_aliases:', aliasErr);
    process.exit(1);
  }
  const teamIdByRawName = new Map<string, number>();
  for (const a of aliases ?? []) teamIdByRawName.set(a.raw_name, a.team_id);

  const inserts: MatchInsert[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
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

    const homeTeamId = teamIdByRawName.get(homeTeam);
    const awayTeamId = teamIdByRawName.get(awayTeam);
    if (!homeTeamId || !awayTeamId) {
      skipped.push(`${homeTeam} vs ${awayTeam} on ${matchDate} -- no team_aliases mapping for one or both teams`);
      continue;
    }

    inserts.push({
      league_id: league.league_id,
      season_id: season.season_id,
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

  if (skipped.length > 0) {
    console.warn(`\u26a0\ufe0f  ${skipped.length} row(s) skipped -- missing team_aliases mapping:`);
    skipped.forEach((s) => console.warn('  -', s));
  }

  if (inserts.length === 0) {
    console.log('No complete match rows to upsert. Done.');
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
    console.error('Upsert failed:', upsertErr);
    process.exit(1);
  }

  console.log(`\u2705 Upserted ${count ?? inserts.length} row(s).`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
