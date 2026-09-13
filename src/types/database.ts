// ============================================================================
// src/types/database.ts
//
// Hand-written types matching supabase/migrations/0001_init_schema.sql.
//
// NOTE: Once you have the Supabase CLI linked, you can replace this file
// with an auto-generated one that's always perfectly in sync with the real
// schema by running:
//
//     npm run types:generate
//
// That command is already wired up in package.json. Auto-generated types
// are preferable long-term since they can't drift from the actual database.
// This hand-written version exists so the importer has type safety from
// day one, before you've run that command.
// ============================================================================

export type Country = {
  country_id: number;
  name: string;
  code: string | null;
  created_at: string;
};

export type CountryInsert = {
  name: string;
  code?: string | null;
};

export type League = {
  league_id: number;
  country_id: number;
  code: string;
  name: string;
  tier: number | null;
  competition_type: 'league' | 'cup' | null;
  scope: 'domestic' | 'continental' | 'international' | null;
  confederation: string | null;
  created_at: string;
};

export type LeagueInsert = {
  country_id: number;
  code: string;
  name: string;
  tier?: number | null;
  competition_type?: 'league' | 'cup' | null;
  scope?: 'domestic' | 'continental' | 'international' | null;
  confederation?: string | null;
};

export type Season = {
  season_id: number;
  label: string;
  start_year: number;
  end_year: number;
  created_at: string;
};

export type SeasonInsert = {
  label: string;
  start_year: number;
  end_year: number;
};

export type Team = {
  team_id: number;
  country_id: number;
  canonical_name: string;
  created_at: string;
};

export type TeamInsert = {
  country_id: number;
  canonical_name: string;
};

export type TeamAlias = {
  team_alias_id: number;
  team_id: number;
  source_name: string;
  raw_name: string;
  created_at: string;
};

export type TeamAliasInsert = {
  team_id: number;
  source_name: string;
  raw_name: string;
};

export type MatchResult = 'H' | 'D' | 'A';

export type Match = {
  match_id: number;
  league_id: number;
  season_id: number;
  home_team_id: number;
  away_team_id: number;
  match_date: string; // ISO date, e.g. '2024-08-16'
  kickoff_time: string | null; // 'HH:MM:SS' or null
  referee: string | null;
  full_time_home_goals: number;
  full_time_away_goals: number;
  full_time_result: MatchResult;
  half_time_home_goals: number | null;
  half_time_away_goals: number | null;
  half_time_result: MatchResult | null;
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
  created_at: string;
  updated_at: string;
};

export type MatchInsert = {
  league_id: number;
  season_id: number;
  home_team_id: number;
  away_team_id: number;
  match_date: string;
  kickoff_time?: string | null;
  referee?: string | null;
  full_time_home_goals: number;
  full_time_away_goals: number;
  full_time_result: MatchResult;
  half_time_home_goals?: number | null;
  half_time_away_goals?: number | null;
  half_time_result?: MatchResult | null;
  home_shots?: number | null;
  away_shots?: number | null;
  home_shots_on_target?: number | null;
  away_shots_on_target?: number | null;
  home_corners?: number | null;
  away_corners?: number | null;
  home_fouls?: number | null;
  away_fouls?: number | null;
  home_yellow_cards?: number;
  away_yellow_cards?: number;
  home_red_cards?: number;
  away_red_cards?: number;
  source_name?: string;
  source_file: string;
};

export type ModelFitRunStatus = 'pending' | 'accepted' | 'rejected';

export type ModelFitRun = {
  fit_run_id: number;
  league_id: number;
  window_start_date: string;
  window_end_date: string;
  rho: number;
  home_advantage: number;
  decay_half_life_days: number;
  log_likelihood: number | null;
  converged: boolean;
  matches_used: number;
  fitted_at: string;
  status: ModelFitRunStatus;
  rejection_reason: string | null;
  validation_warnings: string[];
  validation_checks: Record<string, unknown>;
};

export type TeamRating = {
  team_rating_id: number;
  fit_run_id: number;
  team_id: number;
  attack_strength: number;
  defence_strength: number;
  is_estimated: boolean;
  estimated_from_team_id: number | null;
  estimated_from_fit_run_id: number | null;
  estimation_note: string | null;
  created_at: string;
};

export type FixtureStatus = 'scheduled' | 'postponed' | 'played';

export type Fixture = {
  fixture_id: number;
  league_id: number;
  season_id: number;
  home_team_id: number;
  away_team_id: number;
  kickoff_date: string;
  kickoff_time: string | null;
  matchweek: number | null;
  status: FixtureStatus;
  source_name: string;
  source_file: string | null;
  created_at: string;
  updated_at: string;
  // Dixon-Coles expected goals, frozen at prediction time from the
  // league's then-latest model_fit_run -- see backfill_fixture_predictions()
  // in Supabase. Only ever set while status is scheduled/postponed; never
  // touched once a fixture is played, so it stays a genuine pre-match
  // forecast rather than a later, hindsight-tainted recalculation.
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
  prediction_fit_run_id: number | null;
  predicted_at: string | null;
};

export type FixtureInsert = {
  league_id: number;
  season_id: number;
  home_team_id: number;
  away_team_id: number;
  kickoff_date: string;
  kickoff_time?: string | null;
  matchweek?: number | null;
  status?: FixtureStatus;
  source_name?: string;
  source_file?: string | null;
};

export type TeamCategory = {
  category_id: number;
  slug: string;
  name: string;
  description: string | null;
  display_color: string | null;
  created_at: string;
};

export type TeamCategoryMembership = {
  membership_id: number;
  category_id: number;
  team_id: number;
  season_id: number;
  created_at: string;
};

export type PointDeduction = {
  deduction_id: number;
  league_id: number;
  season_id: number;
  team_id: number;
  points: number; // negative = deduction, positive = correction/addition
  reason: string | null;
  effective_date: string | null; // ISO date
  created_at: string;
};

/** One row per daily fixture-import run. Used to surface "data last refreshed" to the frontend. */
export type FixtureRefreshRun = {
  refresh_run_id: number;
  started_at: string;
  finished_at: string | null;
  competitions: string[] | null;
  rows_seen: number;
  rows_updated: number;
  status: string;
  error_message: string | null;
};

// ----------------------------------------------------------------------------
// Raw source data layer -- unprocessed rows as retrieved from each provider,
// kept separate from the curated matches/fixtures tables. Populated by a
// sibling importer project, not this webapp; the webapp only ever reads
// these three tables. See src/pages/SourceData.tsx.
// ----------------------------------------------------------------------------

export type RawMatchFile = {
  raw_file_id: number;
  source_name: string;
  source_url: string;
  source_code: string | null;
  competition_code: string | null;
  season_label: string | null;
  retrieved_at: string;
  content_hash: string;
  row_count: number | null;
  // The literal column headers present in this specific file, in their
  // original order -- authoritative for rendering, since different
  // files/seasons/providers can (and do) have different columns.
  column_names: string[] | null;
  file_metadata: Record<string, unknown>;
};

export type SourceMatchRow = {
  source_match_row_id: number;
  source_competition_id: number | null;
  raw_file_id: number | null;
  source_row_key: string;
  source_home_team: string | null;
  source_away_team: string | null;
  source_match_date: string | null; // ISO date
  source_kickoff_time: string | null;
  // The complete original row, verbatim, keyed by that file's own column
  // names -- values are whatever the source provider sent (typically
  // strings, even for numeric-looking fields).
  raw_data: Record<string, unknown>;
  raw_hash: string;
  first_seen_at: string;
  last_seen_at: string;
  source_row_number: number | null;
};

export type DataSourceCompetition = {
  source_competition_id: number;
  source_name: string;
  country_name: string;
  source_code: string;
  competition_code: string;
  competition_type: 'league' | 'cup';
  season_label: string;
  source_url: string;
  enabled: boolean;
  priority: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// ----------------------------------------------------------------------------
// Supabase Database type -- the shape expected by createClient<Database>()
//
// NOTE on `Relationships: []`: supabase-js's internal GenericTable type
// requires a Relationships array on every table (used for typed joins via
// foreign-table select syntax, e.g. .select('*, teams(*)')). We don't use
// that feature here, so each table's Relationships is left empty -- but the
// field itself must be present or TypeScript silently collapses every query
// result to `never` instead of raising a clear error. This was verified by
// testing against the installed @supabase/supabase-js version directly.
// ----------------------------------------------------------------------------
export type Database = {
  public: {
    Tables: {
      countries: {
        Row: Country;
        Insert: CountryInsert;
        Update: Partial<CountryInsert>;
        Relationships: [];
      };
      leagues: {
        Row: League;
        Insert: LeagueInsert;
        Update: Partial<LeagueInsert>;
        Relationships: [];
      };
      seasons: {
        Row: Season;
        Insert: SeasonInsert;
        Update: Partial<SeasonInsert>;
        Relationships: [];
      };
      teams: {
        Row: Team;
        Insert: TeamInsert;
        Update: Partial<TeamInsert>;
        Relationships: [];
      };
      team_aliases: {
        Row: TeamAlias;
        Insert: TeamAliasInsert;
        Update: Partial<TeamAliasInsert>;
        Relationships: [];
      };
      matches: {
        Row: Match;
        Insert: MatchInsert;
        Update: Partial<MatchInsert>;
        Relationships: [];
      };
      model_fit_runs: {
        Row: ModelFitRun;
        Insert: Omit<ModelFitRun, 'fit_run_id' | 'fitted_at'>;
        Update: Partial<Omit<ModelFitRun, 'fit_run_id'>>;
        Relationships: [];
      };
      team_ratings: {
        Row: TeamRating;
        Insert: Omit<TeamRating, 'team_rating_id' | 'created_at'>;
        Update: Partial<Omit<TeamRating, 'team_rating_id'>>;
        Relationships: [];
      };
      fixtures: {
        Row: Fixture;
        Insert: FixtureInsert;
        Update: Partial<FixtureInsert>;
        Relationships: [];
      };
      team_categories: {
        Row: TeamCategory;
        Insert: Omit<TeamCategory, 'category_id' | 'created_at'>;
        Update: Partial<Omit<TeamCategory, 'category_id'>>;
        Relationships: [];
      };
      team_category_memberships: {
        Row: TeamCategoryMembership;
        Insert: Omit<TeamCategoryMembership, 'membership_id' | 'created_at'>;
        Update: Partial<Omit<TeamCategoryMembership, 'membership_id'>>;
        Relationships: [];
      };
      point_deductions: {
        Row: PointDeduction;
        Insert: Omit<PointDeduction, 'deduction_id' | 'created_at'>;
        Update: Partial<Omit<PointDeduction, 'deduction_id'>>;
        Relationships: [];
      };
      raw_match_files: {
        Row: RawMatchFile;
        Insert: Omit<RawMatchFile, 'raw_file_id'>;
        Update: Partial<Omit<RawMatchFile, 'raw_file_id'>>;
        Relationships: [];
      };
      source_match_rows: {
        Row: SourceMatchRow;
        Insert: Omit<SourceMatchRow, 'source_match_row_id' | 'first_seen_at' | 'last_seen_at'>;
        Update: Partial<Omit<SourceMatchRow, 'source_match_row_id'>>;
        Relationships: [];
      };
      data_source_competitions: {
        Row: DataSourceCompetition;
        Insert: Omit<DataSourceCompetition, 'source_competition_id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DataSourceCompetition, 'source_competition_id'>>;
        Relationships: [];
      };
      fixture_refresh_runs: {
        Row: FixtureRefreshRun;
        Insert: Omit<FixtureRefreshRun, 'refresh_run_id'>;
        Update: Partial<Omit<FixtureRefreshRun, 'refresh_run_id'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
