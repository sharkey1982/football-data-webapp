// ============================================================================
// src/types/database.ts
//
// Bridge between the CLI-generated schema types (database.generated.ts,
// regenerate with the Supabase MCP `generate_typescript_types` tool or
// `npm run types:generate`) and the flat, hand-named types the rest of
// the app imports (`Match`, `Team`, `FplPlayer`, ...).
//
// Why a bridge rather than importing the generated file directly
// everywhere: ~40 files import these flat names, and the generated
// shape (`Database['public']['Tables']['matches']['Row']`) is verbose
// and would have meant touching every one of them for no behavioural
// change. This file keeps every existing import working while the
// underlying shape now comes from the real schema instead of a
// hand-maintained copy that had drifted -- most visibly, `Functions`
// was `Record<string, never>`, which is why every RPC call in the app
// needed `(supabase as any).rpc(...)`.
//
// NARROWING: a handful of columns are backed by a CHECK constraint
// rather than a Postgres ENUM (full_time_result, status columns,
// element_type, and a few others). PostgREST's codegen can't see CHECK
// constraints, so it generates `string` for these -- correct but far
// looser than the actual set of values the column ever holds. Each one
// is narrowed back to its real literal union below, via `Narrow<>`.
// Getting one of these wrong in either direction is exactly the kind of
// silent bug this bridge exists to prevent: too loose and a typo like
// 'Home' instead of 'H' compiles; too narrow and a legitimate value gets
// rejected. Each override is a single field, checked against the
// migration that created the constraint.
// ============================================================================

import type { Database as GeneratedDatabase, Json } from './database.generated';

export type { Json };

type Tables = GeneratedDatabase['public']['Tables'];
type Views = GeneratedDatabase['public']['Views'];
type Functions = GeneratedDatabase['public']['Functions'];

/** Replace the given keys of a generated Row/Insert shape with a
 * narrower type. Used only for the CHECK-constrained columns listed
 * above -- everything else is taken from the schema as-is. */
type Narrow<T, O> = Omit<T, keyof O> & O;

// ----------------------------------------------------------------------------
// The four narrow literal unions used by name throughout src/lib and
// src/pages. Kept as standalone exports (not derived) because these are
// the semantic types the app actually reasons in terms of.
// ----------------------------------------------------------------------------

/** matches.full_time_result / half_time_result — CHECK ('H','D','A') */
export type MatchResult = 'H' | 'D' | 'A';

/** model_fit_runs.status — CHECK ('pending','accepted','rejected') */
export type ModelFitRunStatus = 'pending' | 'accepted' | 'rejected';

/** fixtures.status — CHECK ('scheduled','postponed','played') */
export type FixtureStatus = 'scheduled' | 'postponed' | 'played';

/** fpl_players.element_type / fpl_player_projections.fpl_position —
 * FPL's own GKP/DEF/MID/FWD encoding, 1-4. */
export type FplElementType = 1 | 2 | 3 | 4;

// ----------------------------------------------------------------------------
// Reference data
// ----------------------------------------------------------------------------

export type Country = Tables['countries']['Row'];
export type CountryInsert = Tables['countries']['Insert'];

export type League = Narrow<
  Tables['leagues']['Row'],
  { competition_type: 'league' | 'cup' | null; scope: 'domestic' | 'continental' | 'international' | null }
>;
export type LeagueInsert = Narrow<
  Tables['leagues']['Insert'],
  { competition_type?: 'league' | 'cup' | null; scope?: 'domestic' | 'continental' | 'international' | null }
>;

export type Season = Tables['seasons']['Row'];
export type SeasonInsert = Tables['seasons']['Insert'];

export type Team = Tables['teams']['Row'];
export type TeamInsert = Tables['teams']['Insert'];

export type TeamAlias = Tables['team_aliases']['Row'];
export type TeamAliasInsert = Tables['team_aliases']['Insert'];

/** data_source_competitions.competition_type — CHECK ('league','cup') */
export type DataSourceCompetition = Narrow<
  Tables['data_source_competitions']['Row'],
  { competition_type: 'league' | 'cup' }
>;

// ----------------------------------------------------------------------------
// Matches (played) and the model that rates them
// ----------------------------------------------------------------------------

export type Match = Narrow<
  Tables['matches']['Row'],
  { full_time_result: MatchResult; half_time_result: MatchResult | null }
>;
export type MatchInsert = Narrow<
  Tables['matches']['Insert'],
  { full_time_result: MatchResult; half_time_result?: MatchResult | null }
>;

export type ModelFitRun = Narrow<Tables['model_fit_runs']['Row'], { status: ModelFitRunStatus }>;

export type TeamRating = Tables['team_ratings']['Row'];

// validation_warnings is jsonb -- an array of warning strings in all 86
// rows. Typed as string[] here so the Data Health page can map it; the
// underlying column is nullable.
export type LeagueFitStatus = Narrow<
  Views['league_fit_status']['Row'],
  { latest_attempted_status: ModelFitRunStatus | null; latest_attempted_validation_warnings: string[] | null }
>;

// ----------------------------------------------------------------------------
// Fixtures (scheduled) and their tactical consensus
// ----------------------------------------------------------------------------

export type Fixture = Narrow<Tables['fixtures']['Row'], { status: FixtureStatus }>;
export type FixtureInsert = Narrow<Tables['fixtures']['Insert'], { status?: FixtureStatus }>;

export type FixtureRefreshRun = Tables['fixture_refresh_runs']['Row'];
export type FixtureTeamTacticalConsensus = Views['fixture_team_tactical_consensus']['Row'];
export type FixturePlayerTacticalConsensus = Views['fixture_player_tactical_consensus']['Row'];

// ----------------------------------------------------------------------------
// Team categories ("Big Six", "Newly Promoted", ...) and point deductions
// ----------------------------------------------------------------------------

export type TeamCategory = Tables['team_categories']['Row'];
export type TeamCategoryMembership = Tables['team_category_memberships']['Row'];
export type PointDeduction = Tables['point_deductions']['Row'];

// ----------------------------------------------------------------------------
// Raw import data (admin/exploration)
// ----------------------------------------------------------------------------

// column_names is normalised to string[] by getRawMatchFiles (jsonb, but
// an array of CSV headers in every row).
export type RawMatchFile = Omit<Tables['raw_match_files']['Row'], 'column_names'> & {
  column_names: string[];
};
// raw_data is normalised to a plain record by getSourceMatchRows -- the
// importer only ever writes objects, and every consumer reads it as one.
export type SourceMatchRow = Omit<Tables['source_match_rows']['Row'], 'raw_data'> & {
  raw_data: Record<string, unknown>;
};

// ----------------------------------------------------------------------------
// Pipeline run tracking (Data Health)
// ----------------------------------------------------------------------------

export type MatchImportRun = Narrow<Tables['match_import_runs']['Row'], { status: 'success' | 'failed' }>;
export type PipelineRun = Narrow<Tables['pipeline_runs']['Row'], { status: 'running' | 'success' | 'warning' | 'failed' }>;
export type FplIngestionRun = Tables['fpl_ingestion_runs']['Row'];

// ----------------------------------------------------------------------------
// FPL: players, projections, set pieces, squad hierarchy
// ----------------------------------------------------------------------------

export type FplTeam = Tables['fpl_teams']['Row'];

// NOT narrowed to FplElementType: fpl_players.element_type has no CHECK
// constraint, so the database could hold any int. Values are 1-4 today
// purely because that's what FPL's API sends. Narrowing here would claim
// a guarantee the schema doesn't make; call sites that need the literal
// union narrow at the read boundary instead (see asElementType).
export type FplPlayer = Tables['fpl_players']['Row'];

export type FplPlayerProjection = Tables['fpl_player_projections']['Row'];

export type FplSeasonFixtureFeed = Views['fpl_season_fixture_feed']['Row'];
export type FplSeasonPlayerProjectionFeed = Views['fpl_season_player_projection_feed']['Row'];
export type FplPredictionActualStartComparison = Views['fpl_prediction_actual_start_comparison']['Row'];
export type FplProjectionFrontendFeedV6 = Views['fpl_projection_frontend_feed_v6']['Row'];

/**
 * Table: set_piece_hierarchies -- per-team penalty/free-kick/corner
 * pecking order). source_player_id is stored as text; match against
 * fpl_player_id by casting it to text.
 */
export type SetPieceHierarchyRow = Narrow<
  Tables['set_piece_hierarchies']['Row'],
  { set_piece_type: 'penalty' | 'direct_free_kick' | 'indirect_free_kick' | 'corner_left' | 'corner_right' }
>;

/**
 * Table: player_squad_hierarchy -- squad pecking order per player
 * ('first_choice' | 'rotation' | 'backup' | 'unknown'). Only covers a
 * subset of players -- absence of a row is not itself meaningful, just
 * means this hasn't been classified yet.
 */
export type PlayerSquadHierarchyRow = Narrow<
  Tables['player_squad_hierarchy']['Row'],
  { squad_status: 'first_choice' | 'rotation' | 'backup' | 'unknown' }
>;

// ----------------------------------------------------------------------------
// Supabase Database type -- the shape expected by createClient<Database>()
//
// This is now the REAL generated Database (all ~150 tables/views and every
// RPC function, with real Args/Returns), not the old hand-maintained
// subset. That's what turns `supabase.rpc('some_function', {...})` from
// an unchecked call into a checked one, and is the actual fix for the
// `(supabase as any).rpc(...)` pattern used throughout src/lib.
//
// The flat exported types above are NOT re-derived from this re-export in
// the other direction -- they're independent aliases onto the same
// underlying Tables/Views (with the narrowing applied). Client code that
// imports `Match`, `Team`, etc. gets the narrowed version; code that
// constructs `createClient<Database>()` gets full functions/tables
// coverage. The two stay consistent because they both trace back to
// database.generated.ts.
// ----------------------------------------------------------------------------

export type Database = GeneratedDatabase;
export type { Functions as DatabaseFunctions };
