// ============================================================================
// src/lib/api.ts
//
// Barrel for the data-access layer. The queries themselves now live in
// focused modules; this re-exports them so the ~40 call sites across the
// app didn't have to change, and so "import from api" stays the obvious
// thing to do.
//
// Split because one 2,100-line file mixing football data, FPL fixtures,
// model output, admin surfaces and pipeline health gave no clue where a
// given query lived. The modules are:
//
//   referenceApi  leagues, countries, seasons, teams, team categories
//   matchesApi    played matches, head-to-head, search, league table
//   formStats     pure client-side form/distribution helpers (no queries)
//   modelApi      Dixon-Coles fit runs, ratings, team strength, FDR grid
//   fixturesApi   scheduled fixtures, predictions, refresh tracking
//   healthApi     pipeline runs and data-integrity checks
//   rawDataApi    the raw match archive and unprocessed source rows
//
// NOTE ON TEAM NAMES: selects read `canonical_name:display_name` --
// PostgREST column aliasing, not a typo. teams.canonical_name is the
// DATA-SOURCE name used to match incoming football-data.co.uk rows
// ("Nott'm Forest", "Sheffield Weds"); teams.display_name is the public
// one ("Nottingham Forest"). The frontend's notion of "the team's name"
// has always meant the display one, so it's corrected at the query
// boundary rather than in ~50 call sites -- which also means no consumer
// of this module had to change. Sorting and search use display_name
// directly, so searching "Nottingham" finds the club.
// ============================================================================

export type { FixtureRefreshRun, LeagueFitStatus, MatchImportRun, PipelineRun, FplIngestionRun } from '../types/database';
export type { RawMatchFile, SourceMatchRow } from '../types/database';

export * from './referenceApi';
export * from './matchesApi';
export * from './formStats';
export * from './modelApi';
export * from './fixturesApi';
export * from './healthApi';
export * from './rawDataApi';
