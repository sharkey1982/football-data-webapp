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
  /** Name used to MATCH incoming source rows (football-data.co.uk's CSV
   * abbreviations: "Nott'm Forest", "Sheffield Weds"). Never show this to
   * a user or derive a URL from it -- use display_name. */
  canonical_name: string;
  /** Public-facing proper name ("Nottingham Forest"). Slugs derive from
   * this, so it's what determines a team's canonical URL. */
  display_name: string;
  slug: string | null;
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

/** One row per scripts/import-daily.ts run -- distinct from FixtureRefreshRun, which tracks a different job (fixtures sync, not match-result import). */
export type MatchImportRun = {
  import_run_id: number;
  started_at: string;
  finished_at: string | null;
  league_code: string;
  rows_seen: number | null;
  rows_upserted: number | null;
  status: 'success' | 'failed';
  error_message: string | null;
};

/** One row per refresh_fpl_projections.py / simulate_fixture_bonus.py / simulate_final_table.py run -- the FPL projections pipeline's own run log, distinct from the raw-data ingestion FplIngestionRun tracks. */
export type PipelineRun = {
  run_id: number;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'warning' | 'failed';
  summary: string | null;
  error_message: string | null;
};

/** One row per private.refresh_fpl() run (pg_cron, every 6h) -- the raw official-FPL-API ingestion (teams/players/gameweeks/fixtures/snapshots), distinct from PipelineRun's derived-projection jobs. */
export type FplIngestionRun = {
  run_id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  teams_upserted: number | null;
  players_upserted: number | null;
  gameweeks_upserted: number | null;
  fixtures_upserted: number | null;
  player_gameweeks_upserted: number | null;
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
// FPL projections layer -- see src/lib/fplApi.ts for the queries that use
// these. Populated by a separate modelling pipeline (Dixon-Coles team xG ->
// formation -> tactical role -> player allocation -> FPL scoring), not this
// webapp. The webapp only ever reads these tables/views.
//
// NOTE on numeric fields typed `string`: unlike the float8 columns above
// (which PostgREST returns as JSON numbers), these columns are declared as
// unscaled `numeric` in Postgres and are returned by PostgREST as JSON
// strings to avoid silent precision loss -- parse with Number(...) before
// use. Some of these values come back as very long exact-decimal strings
// (300+ digits); this looks like a schema gap (missing numeric(p,s) scale
// on the modelling side) rather than a numeric error, but the frontend
// treats them defensively either way -- see src/lib/fplApi.ts's `num()`.
// ----------------------------------------------------------------------------

export type FplTeam = {
  fpl_team_id: number;
  canonical_team_id: number | null;
  code: number | null;
  name: string;
  short_name: string | null;
  strength: number | null;
  strength_overall_home: number | null;
  strength_overall_away: number | null;
  strength_attack_home: number | null;
  strength_attack_away: number | null;
  strength_defence_home: number | null;
  strength_defence_away: number | null;
  source_payload: Record<string, unknown> | null;
  updated_at: string;
  season_id: number | null;
};

/** FPL element_type: 1 = Goalkeeper, 2 = Defender, 3 = Midfielder, 4 = Forward. */
export type FplElementType = 1 | 2 | 3 | 4;

export type FplPlayer = {
  fpl_player_id: number;
  /** Canonical URL slug for this player's public page (/fpl/players/:slug) -- generated by the fpl_players_generate_slug trigger on insert/name change, unique per season. Nullable so a name that slugifies to nothing can never hard-fail the 6-hourly FPL ingestion. */
  slug: string | null;
  canonical_team_id: number | null;
  fpl_team_id: number | null;
  first_name: string | null;
  second_name: string | null;
  web_name: string | null;
  element_type: FplElementType | null;
  status: string | null;
  now_cost: number | null;
  selected_by_percent: string | null;
  total_points: number | null;
  event_points: number | null;
  minutes: number | null;
  goals_scored: number | null;
  assists: number | null;
  clean_sheets: number | null;
  goals_conceded: number | null;
  own_goals: number | null;
  penalties_saved: number | null;
  penalties_missed: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  saves: number | null;
  bonus: number | null;
  bps: number | null;
  influence: string | null;
  creativity: string | null;
  threat: string | null;
  ict_index: string | null;
  expected_goals: string | null;
  expected_assists: string | null;
  expected_goal_involvements: string | null;
  expected_goals_conceded: string | null;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  news: string | null;
  news_added: string | null;
  source_payload: Record<string, unknown> | null;
  updated_at: string;
  season_id: number | null;
};

/**
 * One row per (fixture, fpl_player_id, model_version) -- the principal
 * persisted projection output. Current model_version is 'prototype_v3'.
 */
export type FplPlayerProjection = {
  projection_id: number;
  season_id: number;
  fixture_id: number;
  fpl_player_id: number;
  generated_at: string;
  model_version: string;
  expected_minutes: string | null;
  expected_goals: string | null;
  expected_assists: string | null;
  clean_sheet_probability: string | null;
  expected_saves: string | null;
  defensive_contribution_probability: string | null;
  expected_bonus: string | null;
  xpts_appearance: string | null;
  xpts_goals: string | null;
  xpts_assists: string | null;
  xpts_clean_sheet: string | null;
  xpts_saves: string | null;
  xpts_defensive_contribution: string | null;
  xpts_cards_own_goals: string | null;
  xpts_bonus: string | null;
  expected_fpl_points: string | null;
  start_probability: string | null;
  sub_appearance_probability: string | null;
  xpts_goals_conceded: string | null;
  xpts_penalties: string | null;
  availability_probability: string | null;
  lineup_confidence: string | null;
};

/**
 * View: consensus predicted formation per team per fixture, aggregated
 * across active lineup-prediction sources (see fixture_lineup_predictions).
 */
export type LeagueFitStatus = {
  league_id: number;
  league_code: string;
  league_name: string;
  latest_attempted_fit_run_id: number | null;
  latest_attempted_status: ModelFitRunStatus | null;
  latest_attempted_fitted_at: string | null;
  latest_attempted_matches_used: number | null;
  latest_attempted_converged: boolean | null;
  latest_attempted_rejection_reason: string | null;
  latest_attempted_validation_warnings: string[] | null;
  accepted_fit_run_id: number | null;
  accepted_fitted_at: string | null;
  accepted_matches_used: number | null;
  accepted_rho: number | null;
  accepted_home_advantage: number | null;
};

export type FixtureTeamTacticalConsensus = {
  fixture_id: number;
  team_id: number;
  formation: string | null;
  consensus_weight: string | null;
  sources: number;
};

/**
 * View: consensus REAL tactical role per player per fixture (e.g. RWB, CF,
 * AM) -- distinct from FPL scoring position (fpl_players.element_type).
 */
export type FixturePlayerTacticalConsensus = {
  fixture_id: number;
  team_id: number;
  fpl_player_id: number;
  tactical_role: string | null;
  role_weight: string | null;
  sources: number;
};

/**
 * View: fpl_season_fixture_feed -- all 380 fixtures for the season with
 * Dixon-Coles predicted goals. The season-level fixture contract; distinct
 * from the fixtures table itself (which the single-fixture projection
 * screen already reads directly).
 */
export type FplSeasonFixtureFeed = {
  fixture_id: number;
  season_id: number;
  matchweek: number;
  round: string | null;
  round_number: number | null;
  kickoff_date: string;
  kickoff_time: string | null;
  status: string;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
  predicted_at: string | null;
  has_projection: boolean;
};

/**
 * View: fpl_season_player_projection_feed -- season-wide player projection
 * feed (empirical-Bayes/shrunk ability model + tactical/set-piece
 * allocation). Deliberately does NOT include expected FPL points -- that
 * still comes from the production fpl_player_projections feed only where
 * it exists, never computed client-side from these components.
 */
export type FplSeasonPlayerProjectionFeed = {
  fixture_id: number;
  matchweek: number;
  kickoff_date: string;
  team_id: number;
  web_name: string;
  fpl_player_id: number;
  fpl_position: FplElementType | null;
  tactical_role: string | null;
  expected_minutes: string | null;
  start_probability: string | null;
  sub_appearance_probability: string | null;
  shrunk_xg90: string | null;
  shrunk_xa90: string | null;
  expected_goals: string | null;
  expected_assists: string | null;
  clean_sheet_probability: string | null;
  defensive_contribution_probability: string | null;
  experimental_expected_bonus: string | null;
};

/**
 * View: fpl_prediction_actual_start_comparison -- actual (historical, from
 * real match data) starts/minutes alongside whatever prediction exists for
 * the same player/fixture, if any.
 *
 * generated_pre_kickoff is the field that matters most here: only rows
 * where it's true were genuinely generated before that match kicked off --
 * i.e. only those are real historical forecasts. A row with
 * predicted_start_probability populated but generated_pre_kickoff = false
 * (or null) is a projection generated AFTER the fact (e.g. backfilled once
 * the model existed) and must never be presented as "what the model
 * predicted before the match" -- these are also the reason
 * predicted_start_probability can't be trusted as an indicator of
 * genuine prediction quality on its own; always gate display on this flag.
 *
 * actual_started/actual_minutes are independent of all of the above and
 * always reflect the real match result when present. Real formations and
 * tactical roles are NOT part of this view yet (backend work in progress)
 * -- never infer or display a formation/position from this data.
 */
/**
 * View: fpl_projection_frontend_feed_v6 -- the current, authoritative
 * source for per-player projection numbers AND tactical_role together.
 * Supersedes reading fpl_player_projections (filtered by model_version)
 * and fixture_player_tactical_consensus separately -- this view already
 * carries both, always reflecting the current production model
 * (model_version on each row confirms which one, currently leaguewide_v6).
 * Team-level formation, set-piece roles, and squad status are NOT part of
 * this view and still come from their own tables/views.
 */
export type FplProjectionFrontendFeedV6 = {
  fixture_id: number;
  kickoff_date: string;
  fpl_player_id: number;
  web_name: string;
  team_id: number;
  fpl_position: FplElementType | null;
  tactical_role: string | null;
  minutes_source: string | null;
  model_version: string;
  expected_minutes: number | null;
  start_probability: number | null;
  sub_appearance_probability: number | null;
  expected_goals: number | null;
  expected_assists: number | null;
  clean_sheet_probability: number | null;
  defensive_contribution_probability: number | null;
  expected_bonus: number | null;
  expected_fpl_points: number | null;
  lineup_confidence: number | null;
  generated_at: string | null;
};

export type FplPredictionActualStartComparison = {
  fixture_id: number;
  matchweek: number;
  kickoff_date: string;
  kickoff_time: string | null;
  team_id: number;
  fpl_player_id: number;
  player_name_source: string;
  web_name: string;
  actual_started: boolean;
  actual_minutes: number;
  model_version: string | null;
  predicted_start_probability: number | null;
  predicted_minutes: number | null;
  generated_at: string | null;
  generated_pre_kickoff: boolean | null;
};

/**
 * Table: set_piece_hierarchies -- who takes penalties/free-kicks/corners
 * for a team, and their rank (1 = primary taker, higher = further down the
 * pecking order). source_player_id is stored as text; match against
 * fpl_player_id by casting it to text.
 */
export type SetPieceHierarchyRow = {
  set_piece_hierarchy_id: number;
  season_id: number;
  team_id: number;
  source_player_id: string;
  player_name: string | null;
  set_piece_type: 'penalty' | 'direct_free_kick' | 'indirect_free_kick' | 'corner_left' | 'corner_right';
  rank: number;
  confidence: string | null;
  evidence_count: number | null;
  source_name: string | null;
  source_payload: Record<string, unknown> | null;
  valid_from: string | null;
  valid_to: string | null;
  updated_at: string;
};

/**
 * Table: player_squad_hierarchy -- squad pecking order per player
 * ('first_choice' | 'rotation' | 'backup' | 'unknown'). Only covers a
 * subset of players -- absence of a row is not itself meaningful, just
 * means this hasn't been classified yet.
 */
export type PlayerSquadHierarchyRow = {
  player_squad_hierarchy_id: number;
  season_id: number;
  team_id: number;
  fpl_player_id: number;
  squad_status: 'first_choice' | 'rotation' | 'backup' | 'unknown';
  hierarchy_score: string | null;
  evidence: Record<string, unknown> | null;
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
      match_import_runs: {
        Row: MatchImportRun;
        Insert: Omit<MatchImportRun, 'import_run_id'>;
        Update: Partial<Omit<MatchImportRun, 'import_run_id'>>;
        Relationships: [];
      };
      fpl_teams: {
        Row: FplTeam;
        Insert: Omit<FplTeam, 'updated_at'>;
        Update: Partial<FplTeam>;
        Relationships: [];
      };
      fpl_players: {
        Row: FplPlayer;
        Insert: Omit<FplPlayer, 'updated_at'>;
        Update: Partial<FplPlayer>;
        Relationships: [];
      };
      fpl_player_projections: {
        Row: FplPlayerProjection;
        Insert: Omit<FplPlayerProjection, 'projection_id' | 'generated_at'>;
        Update: Partial<Omit<FplPlayerProjection, 'projection_id'>>;
        Relationships: [];
      };
      set_piece_hierarchies: {
        Row: SetPieceHierarchyRow;
        Insert: Omit<SetPieceHierarchyRow, 'set_piece_hierarchy_id' | 'updated_at'>;
        Update: Partial<Omit<SetPieceHierarchyRow, 'set_piece_hierarchy_id'>>;
        Relationships: [];
      };
      player_squad_hierarchy: {
        Row: PlayerSquadHierarchyRow;
        Insert: Omit<PlayerSquadHierarchyRow, 'player_squad_hierarchy_id' | 'updated_at'>;
        Update: Partial<Omit<PlayerSquadHierarchyRow, 'player_squad_hierarchy_id'>>;
        Relationships: [];
      };
    };
    Views: {
      league_fit_status: {
        Row: LeagueFitStatus;
        Relationships: [];
      };
      fixture_team_tactical_consensus: {
        Row: FixtureTeamTacticalConsensus;
        Relationships: [];
      };
      fixture_player_tactical_consensus: {
        Row: FixturePlayerTacticalConsensus;
        Relationships: [];
      };
      fpl_season_fixture_feed: {
        Row: FplSeasonFixtureFeed;
        Relationships: [];
      };
      fpl_season_player_projection_feed: {
        Row: FplSeasonPlayerProjectionFeed;
        Relationships: [];
      };
      fpl_prediction_actual_start_comparison: {
        Row: FplPredictionActualStartComparison;
        Relationships: [];
      };
      fpl_projection_frontend_feed_v6: {
        Row: FplProjectionFrontendFeedV6;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
};
