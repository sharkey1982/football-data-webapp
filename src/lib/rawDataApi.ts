// ============================================================================
// src/lib/rawDataApi.ts
//
// The filterable match archive and the unprocessed source rows behind
// it. Admin and exploration surfaces rather than the curated pages.
// Split out of api.ts.
// ============================================================================

import { supabase } from './supabase';
import type { RawMatchFile, SourceMatchRow } from '../types/database';
import type { MatchWithNames } from './matchesApi';

// ----------------------------------------------------------------------------
// Raw data browser -- generic, filterable view over the matches table
// ----------------------------------------------------------------------------

export type MatchVenueFilter = 'home' | 'away' | 'either';

export interface RawMatchesFilters {
  leagueId?: number;
  seasonId?: number;
  teamId?: number;
  venue?: MatchVenueFilter; // only meaningful when teamId is set; defaults to 'either'
  competitionType?: string; // filters directly, independent of leagueId -- e.g. "all cups" with no single division picked
  countryId?: number;
}

// PostgREST's own hard cap is 1000 rows per request regardless of what we
// ask for, so this is a UI-level cap one below that -- if we ever hit it,
// we want to know it was OUR limit (and tell the person to narrow further),
// not silently get the same number back from a server-side cutoff and not
// realise results are incomplete.
const RAW_MATCHES_ROW_CAP = 1000;

/**
 * Generic filterable matches query for the Raw Data tab. Unlike
 * getMatchesForTeam/searchMatches (which are tuned for their specific
 * callers, with small limits and team-name-substring matching), this is
 * meant to return "give me everything matching these filters" -- exact
 * team_id matching, an explicit home/away/either venue constraint, and a
 * row count high enough to cover a full team-season (and most
 * league+season combinations) without truncation.
 *
 * Returns both the rows and whether the result was capped, so the UI can
 * tell the person to narrow their filters rather than silently showing a
 * partial table.
 */
export async function getRawMatches(
  filters: RawMatchesFilters
): Promise<{ matches: MatchWithNames[]; truncated: boolean }> {
  let query = supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!matches_away_team_id_fkey(canonical_name:display_name),
      league:leagues!inner(code, name, competition_type, country:countries(name)),
      season:seasons(label)
    `
    )
    .order('match_date', { ascending: false })
    .limit(RAW_MATCHES_ROW_CAP + 1); // +1 so we can detect truncation, not just hit the cap blind

  if (filters.leagueId) query = query.eq('league_id', filters.leagueId);
  if (filters.seasonId) query = query.eq('season_id', filters.seasonId);
  // Filtered via the embedded `league` resource -- !inner above is required
  // for a PostgREST embedded-column filter to actually constrain rows
  // rather than just shaping the select.
  if (filters.competitionType) query = query.eq('league.competition_type', filters.competitionType);
  if (filters.countryId) query = query.eq('league.country_id', filters.countryId);

  if (filters.teamId) {
    const venue = filters.venue ?? 'either';
    if (venue === 'home') {
      query = query.eq('home_team_id', filters.teamId);
    } else if (venue === 'away') {
      query = query.eq('away_team_id', filters.teamId);
    } else {
      query = query.or(`home_team_id.eq.${filters.teamId},away_team_id.eq.${filters.teamId}`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const truncated = rows.length > RAW_MATCHES_ROW_CAP;
  const matches = (truncated ? rows.slice(0, RAW_MATCHES_ROW_CAP) : rows).map((row: any) => ({
    ...row,
    home_team_name: row.home_team?.canonical_name ?? 'Unknown',
    away_team_name: row.away_team?.canonical_name ?? 'Unknown',
    league_code: row.league?.code ?? '',
    league_name: row.league?.name ?? '',
    season_label: row.season?.label ?? '',
    competition_type: row.league?.competition_type ?? null,
    country_name: row.league?.country?.name ?? null,
  })) as MatchWithNames[];

  return { matches, truncated };
}

/** Converts raw match rows to a CSV string for the Raw Data tab's export. */
export function matchesToCsv(matches: MatchWithNames[]): string {
  const columns: { header: string; get: (m: MatchWithNames) => string | number }[] = [
    { header: 'Date', get: (m) => m.match_date },
    { header: 'League', get: (m) => m.league_code },
    { header: 'Competition Type', get: (m) => m.competition_type ?? '' },
    { header: 'Country', get: (m) => m.country_name ?? '' },
    { header: 'Season', get: (m) => m.season_label },
    { header: 'Home Team', get: (m) => m.home_team_name },
    { header: 'Away Team', get: (m) => m.away_team_name },
    { header: 'FT Home Goals', get: (m) => m.full_time_home_goals },
    { header: 'FT Away Goals', get: (m) => m.full_time_away_goals },
    { header: 'FT Result', get: (m) => m.full_time_result },
    { header: 'HT Home Goals', get: (m) => m.half_time_home_goals ?? '' },
    { header: 'HT Away Goals', get: (m) => m.half_time_away_goals ?? '' },
    { header: 'HT Result', get: (m) => m.half_time_result ?? '' },
    { header: 'Home Shots', get: (m) => m.home_shots ?? '' },
    { header: 'Away Shots', get: (m) => m.away_shots ?? '' },
    { header: 'Home Shots on Target', get: (m) => m.home_shots_on_target ?? '' },
    { header: 'Away Shots on Target', get: (m) => m.away_shots_on_target ?? '' },
    { header: 'Home Corners', get: (m) => m.home_corners ?? '' },
    { header: 'Away Corners', get: (m) => m.away_corners ?? '' },
    { header: 'Home Fouls', get: (m) => m.home_fouls ?? '' },
    { header: 'Away Fouls', get: (m) => m.away_fouls ?? '' },
    { header: 'Home Yellow Cards', get: (m) => m.home_yellow_cards },
    { header: 'Away Yellow Cards', get: (m) => m.away_yellow_cards },
    { header: 'Home Red Cards', get: (m) => m.home_red_cards },
    { header: 'Away Red Cards', get: (m) => m.away_red_cards },
    { header: 'Referee', get: (m) => m.referee ?? '' },
  ];

  // CSV-escape: wrap in quotes and double up any embedded quotes if the
  // value contains a comma, quote, or newline -- team names and referee
  // names are the only realistic source of commas (e.g. "Nott'm Forest"
  // has an apostrophe, not a comma, but better safe than a malformed file).
  function escapeCsvValue(value: string | number): string {
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const headerRow = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const dataRows = matches.map((m) => columns.map((c) => escapeCsvValue(c.get(m))).join(','));
  return [headerRow, ...dataRows].join('\n');
}


// ----------------------------------------------------------------------------
// Raw source data (admin/exploration only) -- unprocessed rows exactly as
// retrieved from each provider, powering the Source Data page. Deliberately
// kept separate from every function above: no analytics page reads from
// here, and nothing here should assume a fixed set of competitions,
// seasons, or columns -- the raw layer is expected to keep expanding
// backwards through history and eventually cover other providers.
// ----------------------------------------------------------------------------

export type { RawMatchFile, SourceMatchRow };

/**
 * Every raw source file ingested so far. One row per file (e.g. one
 * season+competition's CSV from football-data.co.uk), with row_count and
 * column_names already computed at ingestion time -- column_names is
 * authoritative for what that specific file contains, so the UI never
 * needs to infer columns by sampling rows.
 */
export async function getRawMatchFiles(): Promise<RawMatchFile[]> {
  const { data, error } = await supabase
    .from('raw_match_files')
    .select('*')
    .order('season_label', { ascending: false })
    .order('competition_code', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Every row belonging to one source file, verbatim. raw_data is the
 * complete original row keyed by that file's own column names -- do not
 * assume any particular key exists; read column_names from the file
 * itself (getRawMatchFiles) to know what's actually there.
 */
export async function getSourceMatchRows(rawFileId: number): Promise<SourceMatchRow[]> {
  const { data, error } = await supabase
    .from('source_match_rows')
    .select(
      'source_match_row_id, source_competition_id, raw_file_id, source_row_key, source_home_team, source_away_team, source_match_date, source_kickoff_time, source_row_number, raw_data, raw_hash, first_seen_at, last_seen_at'
    )
    .eq('raw_file_id', rawFileId)
    .order('source_match_date', { ascending: true, nullsFirst: false })
    .order('source_row_number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

