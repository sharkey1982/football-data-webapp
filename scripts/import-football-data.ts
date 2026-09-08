// ============================================================================
// scripts/import-football-data.ts
//
// Automated importer for football-data.co.uk CSV files.
// Downloads E0.csv (Premier League) for the current season, parses completed
// matches only, resolves team names via team_aliases, and upserts into
// Supabase using the natural key for idempotency.
//
// Usage:
//   npx tsx scripts/import-football-data.ts
//
// Environment variables (from GitHub Actions secrets or .env.local):
//   SUPABASE_URL - Supabase project URL
//   SUPABASE_SERVICE_KEY - Service role key (with write permissions)
//
// ============================================================================

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import * as https from 'https';

config({ path: '.env.local' });

interface FootballDataRow {
  Div?: string;
  Date?: string;
  Time?: string;
  HomeTeam?: string;
  AwayTeam?: string;
  FTHG?: string; // Full Time Home Goals
  FTAG?: string; // Full Time Away Goals
  FTR?: string; // Full Time Result
  HTHG?: string; // Half Time Home Goals
  HTAG?: string; // Half Time Away Goals
  HTR?: string; // Half Time Result
  HS?: string; // Home Shots
  AS?: string; // Away Shots
  HST?: string; // Home Shots on Target
  AST?: string; // Away Shots on Target
  HC?: string; // Home Corners
  AC?: string; // Away Corners
  HF?: string; // Home Fouls
  AF?: string; // Away Fouls
  HY?: string; // Home Yellow Cards
  AY?: string; // Away Yellow Cards
  HR?: string; // Home Red Cards
  AR?: string; // Away Red Cards
  Referee?: string;
}

interface ParsedMatch {
  match_date: string;
  kickoff_time: string | null;
  home_team_name: string;
  away_team_name: string;
  full_time_home_goals: number;
  full_time_away_goals: number;
  full_time_result: 'H' | 'A' | 'D';
  half_time_home_goals: number | null;
  half_time_away_goals: number | null;
  half_time_result: 'H' | 'A' | 'D' | null;
  home_shots: number | null;
  away_shots: number | null;
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  home_corners: number | null;
  away_corners: number | null;
  home_fouls: number | null;
  away_fouls: number | null;
  home_yellow_cards: number;
  away_yellow_cards: number;
  home_red_cards: number;
  away_red_cards: number;
  referee: string | null;
}

interface MatchInsertRow {
  league_id: number;
  season_id: number;
  home_team_id: number;
  away_team_id: number;
  match_date: string;
  kickoff_time: string | null;
  referee: string | null;
  full_time_home_goals: number;
  full_time_away_goals: number;
  full_time_result: 'H' | 'A' | 'D';
  half_time_home_goals: number | null;
  half_time_away_goals: number | null;
  half_time_result: 'H' | 'A' | 'D' | null;
  home_shots: number | null;
  away_shots: number | null;
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  home_corners: number | null;
  away_corners: number | null;
  home_fouls: number | null;
  away_fouls: number | null;
  home_yellow_cards: number;
  away_yellow_cards: number;
  home_red_cards: number;
  away_red_cards: number;
  source_name: string;
  source_file: string;
}

// ============================================================================
// Helpers
// ============================================================================

function downloadCsv(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  // Handle both DD/MM/YY and DD/MM/YYYY formats
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  let year = parts[2];
  // If year is 2-digit, assume 20xx
  if (year.length === 2) {
    year = '20' + year;
  }
  return `${year}-${month}-${day}`;
}

function parseTime(timeStr: string): string | null {
  if (!timeStr || timeStr === '-') return null;
  // Football Data format: "15:00"
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr + ':00';
  }
  return null;
}

function parseResult(resultStr: string): 'H' | 'A' | 'D' | null {
  if (resultStr === 'H' || resultStr === 'A' || resultStr === 'D') {
    return resultStr;
  }
  return null;
}

function parseNumeric(str: string): number | null {
  if (!str || str === '-') return null;
  const n = Number(str);
  return isNaN(n) ? null : n;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🔄 Football Data Importer Starting...\n');

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  // Initialize Supabase client with service role key (write access)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    // ========================================================================
    // Step 1: Download CSV
    // ========================================================================
    const csvUrl = 'https://football-data.co.uk/mmz4281/2627/E0.csv';
    console.log(`📥 Downloading from: ${csvUrl}`);
    const csvContent = await downloadCsv(csvUrl);
    const lines = csvContent.trim().split('\n');
    console.log(`✅ Downloaded ${lines.length} lines\n`);

    // ========================================================================
    // Step 2: Parse CSV
    // ========================================================================
    console.log('📋 Parsing CSV...');
    const records: FootballDataRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });
    console.log(`✅ Parsed ${records.length} records from CSV\n`);

    // ========================================================================
    // Step 3: Get reference data (league, season, existing teams)
    // ========================================================================
    console.log('🔍 Fetching reference data from Supabase...');

    const { data: leagues, error: leaguesErr } = await supabase
      .from('leagues')
      .select('league_id, code')
      .eq('code', 'E0')
      .single();
    if (leaguesErr || !leagues) {
      console.error('❌ Failed to find league E0:', leaguesErr?.message);
      process.exit(1);
    }
    const leagueId = leagues.league_id;

    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('season_id, label')
      .eq('label', '2627')
      .single();
    if (seasonsErr || !seasons) {
      console.error('❌ Failed to find season 2627:', seasonsErr?.message);
      process.exit(1);
    }
    const seasonId = seasons.season_id;

    // Fetch existing team_aliases to resolve raw names -> team_id
    const { data: aliases, error: aliasesErr } = await supabase
      .from('team_aliases')
      .select('team_id, source_name, raw_name')
      .eq('source_name', 'football-data.co.uk');
    if (aliasesErr) {
      console.error('❌ Failed to fetch team aliases:', aliasesErr.message);
      process.exit(1);
    }

    // Build a map: raw_name (from CSV) -> team_id
    const aliasMap = new Map<string, number>();
    (aliases || []).forEach((alias) => {
      aliasMap.set(alias.raw_name, alias.team_id);
    });

    console.log(`✅ League ID: ${leagueId}, Season ID: ${seasonId}`);
    console.log(`✅ Loaded ${aliasMap.size} team aliases\n`);

    // ========================================================================
    // Step 4: Filter for completed matches and parse details
    // ========================================================================
    console.log('🔍 Filtering for completed matches...');
    const parsedMatches: ParsedMatch[] = [];
    const unmatchedTeams = new Set<string>();

    for (const row of records) {
      // Skip header or incomplete rows
      if (!row.HomeTeam || !row.AwayTeam || !row.Date) {
        continue;
      }

      // Only process completed matches (with full-time goals)
      if (!row.FTHG || !row.FTAG || !row.FTR) {
        continue;
      }

      parsedMatches.push({
        match_date: parseDate(row.Date)!,
        kickoff_time: parseTime(row.Time || ''),
        home_team_name: row.HomeTeam,
        away_team_name: row.AwayTeam,
        full_time_home_goals: parseNumeric(row.FTHG) || 0,
        full_time_away_goals: parseNumeric(row.FTAG) || 0,
        full_time_result: parseResult(row.FTR)!,
        half_time_home_goals: parseNumeric(row.HTHG),
        half_time_away_goals: parseNumeric(row.HTAG),
        half_time_result: parseResult(row.HTR || ''),
        home_shots: parseNumeric(row.HS),
        away_shots: parseNumeric(row.AS),
        home_shots_on_target: parseNumeric(row.HST),
        away_shots_on_target: parseNumeric(row.AST),
        home_corners: parseNumeric(row.HC),
        away_corners: parseNumeric(row.AC),
        home_fouls: parseNumeric(row.HF),
        away_fouls: parseNumeric(row.AF),
        home_yellow_cards: parseNumeric(row.HY) || 0,
        away_yellow_cards: parseNumeric(row.AY) || 0,
        home_red_cards: parseNumeric(row.HR) || 0,
        away_red_cards: parseNumeric(row.AR) || 0,
        referee: row.Referee || null,
      });

      // Track team names for alias resolution
      if (!aliasMap.has(row.HomeTeam)) {
        unmatchedTeams.add(row.HomeTeam);
      }
      if (!aliasMap.has(row.AwayTeam)) {
        unmatchedTeams.add(row.AwayTeam);
      }
    }

    console.log(`✅ Found ${parsedMatches.length} completed matches\n`);

    if (unmatchedTeams.size > 0) {
      console.warn(`⚠️  Unmatched teams (need aliases): ${Array.from(unmatchedTeams).join(', ')}`);
    }

    // ========================================================================
    // Step 5: Resolve team IDs via aliases; skip unmatched teams
    // ========================================================================
    console.log('🔗 Resolving team IDs...');
    const matchInserts: MatchInsertRow[] = [];
    let skipped = 0;

    for (const match of parsedMatches) {
      const homeTeamId = aliasMap.get(match.home_team_name);
      const awayTeamId = aliasMap.get(match.away_team_name);

      if (!homeTeamId || !awayTeamId) {
        skipped++;
        continue;
      }

      matchInserts.push({
        league_id: leagueId,
        season_id: seasonId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        match_date: match.match_date,
        kickoff_time: match.kickoff_time,
        referee: match.referee,
        full_time_home_goals: match.full_time_home_goals,
        full_time_away_goals: match.full_time_away_goals,
        full_time_result: match.full_time_result,
        half_time_home_goals: match.half_time_home_goals,
        half_time_away_goals: match.half_time_away_goals,
        half_time_result: match.half_time_result,
        home_shots: match.home_shots,
        away_shots: match.away_shots,
        home_shots_on_target: match.home_shots_on_target,
        away_shots_on_target: match.away_shots_on_target,
        home_corners: match.home_corners,
        away_corners: match.away_corners,
        home_fouls: match.home_fouls,
        away_fouls: match.away_fouls,
        home_yellow_cards: match.home_yellow_cards,
        away_yellow_cards: match.away_yellow_cards,
        home_red_cards: match.home_red_cards,
        away_red_cards: match.away_red_cards,
        source_name: 'football-data.co.uk',
        source_file: 'England/2627/E0.csv',
      });
    }

    console.log(`✅ Resolved ${matchInserts.length} matches (skipped ${skipped} with unmatched teams)\n`);

    // ========================================================================
    // Step 6: Upsert into Supabase
    // ========================================================================
    console.log('💾 Upserting matches into Supabase...');
    if (matchInserts.length === 0) {
      console.log('⚠️  No matches to insert.');
    } else {
      const { error: upsertError, count } = await supabase
        .from('matches')
        .upsert(matchInserts, {
          onConflict: 'league_id,season_id,match_date,home_team_id,away_team_id',
        });

      if (upsertError) {
        console.error('❌ Upsert failed:', upsertError.message);
        process.exit(1);
      }

      console.log(`✅ Upserted ${matchInserts.length} matches`);
    }

    // ========================================================================
    // Step 7: Summary
    // ========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`CSV rows downloaded:      ${lines.length}`);
    console.log(`Completed matches parsed: ${parsedMatches.length}`);
    console.log(`Matches with team IDs:    ${matchInserts.length}`);
    console.log(`Latest match date:        ${matchInserts.length > 0 ? matchInserts[matchInserts.length - 1].match_date : 'N/A'}`);
    console.log('='.repeat(60));
    console.log('✅ Import complete!\n');
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main();
