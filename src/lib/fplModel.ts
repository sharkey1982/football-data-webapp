/**
 * The FPL projection model_version the site treats as production.
 *
 * Single source of truth for the frontend: every query that filters
 * fpl_player_projections by model_version imports this rather than repeating
 * the literal (16 Oct 2026: four files did, so a model switch had to find
 * them all). The database names the same version in
 * public.production_models (component 'fpl_player_projection'), which the
 * monitoring views and integrity checks read; promote a model by changing
 * both together. src/__tests__/fplModelVersion.test.ts fails if a literal
 * version string reappears outside this file and the dated article snapshots.
 */
export const CURRENT_MODEL_VERSION = 'leaguewide_v6';
