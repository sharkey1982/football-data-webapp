// ============================================================================
// src/lib/healthApi.ts
//
// Pipeline health and data-integrity checks -- what Data Health reads.
//
// Kept together because they answer one question: is the data any good?
// That is a different concern from serving it, and the checks here exist
// because this project's characteristic bug produces no error at all.
// ============================================================================

import { supabase } from './supabase';
import type { FplIngestionRun, MatchImportRun, PipelineRun } from '../types/database';

export async function getFitRunRhos(): Promise<Map<number, number>> {
  const { data, error } = await (supabase as any)
    .from('model_fit_runs')
    .select('fit_run_id, rho')
    .not('rho', 'is', null);
  if (error) throw error;
  return new Map(((data ?? []) as any[]).map((r) => [Number(r.fit_run_id), Number(r.rho)]));
}

/** Most recent daily match-result import runs (any status), newest first -- for the Data Health page's "results added" section. */
export async function getRecentMatchImportRuns(limit = 10): Promise<MatchImportRun[]> {
  const { data, error } = await supabase
    .from('match_import_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  // status has a CHECK constraint ('success','failed'); Postgres stores it
  // as text so codegen widens it to string.
  return (data ?? []) as MatchImportRun[];
}

export type IntegrityCheck = { check_name: string; status: string; detail: string };

/** Every data check this project has learned to need, in one call.
 *
 * These bugs produce no error. Three in one session ran cleanly and
 * served wrong data -- NULL season_ids invisible to season-filtered
 * queries, double gameweeks dropped by a narrow primary key, tables
 * readable by nobody. Each was found only because someone thought to
 * ask. Putting the questions on a page means nobody has to remember
 * them. */
export async function getDataIntegrityReport(): Promise<IntegrityCheck[]> {
  const { data, error } = await (supabase as any).rpc('get_data_integrity_report');
  if (error) throw error;
  return (data ?? []) as IntegrityCheck[];
}

export type PublicReadAuditRow = {
  object_name: string;
  object_kind: string;
  rls_enabled: boolean;
  has_select_policy: boolean;
  anon_has_select_grant: boolean;
  anon_can_read: boolean;
};

/** Tables the public frontend cannot read.
 *
 * Exists because this failure is SILENT: a table with RLS enabled and no
 * SELECT policy returns an empty result, not an error, so a page renders
 * "no data" and nothing anywhere reports a problem. Four tables shipped
 * that way before this audit existed -- match_odds, fpl_fixtures,
 * fixture_refresh_runs and fpl_ingestion_runs -- and each was found only
 * when a human looked at a blank page.
 *
 * Plenty of tables SHOULD be unreadable, so this is a list to review,
 * not a list of bugs. The one that matters is a table with a SELECT
 * grant but no policy: the grant means someone intended it to be public
 * and the policy was forgotten. */
export async function getPublicReadAudit(): Promise<PublicReadAuditRow[]> {
  const { data, error } = await (supabase as any).rpc('get_public_read_audit');
  if (error) throw error;
  return (data ?? []) as PublicReadAuditRow[];
}

/** Most recent FPL projections pipeline runs (refresh/bonus/final-table, any status), newest first -- for the Data Health page's "Fantasy updates" section. This is the log that answers "how do I know fantasy updates have run" -- these three scripts wrote nowhere at all before it existed. */
export async function getRecentPipelineRuns(limit = 15): Promise<PipelineRun[]> {
  const { data, error } = await (supabase as any)
    .from('pipeline_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Most recent raw FPL data ingestion runs (private.refresh_fpl(), pg_cron every 6h), newest first -- the official-FPL-API layer underneath the projections pipeline above. */
export async function getRecentFplIngestionRuns(limit = 10): Promise<FplIngestionRun[]> {
  const { data, error } = await (supabase as any)
    .from('fpl_ingestion_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Fetches every fixture in a division+season at once (all matchweeks) -- powers the Fixtures page's collapsible-by-matchweek list, so the calendar and the list are always derived from the same data instead of two separate fetches that could drift out of sync. */
