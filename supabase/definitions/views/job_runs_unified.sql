-- Live definition exported from the database (view job_runs_unified).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.job_runs_unified as
 SELECT 'pipeline_runs'::text AS run_log,
    pipeline_runs.job_name AS run_key,
    (pipeline_runs.run_id)::text AS run_id,
    pipeline_runs.started_at,
    pipeline_runs.finished_at,
    pipeline_runs.status,
    pipeline_runs.rows_changed,
    pipeline_runs.error_message AS error
   FROM pipeline_runs
  WHERE (pipeline_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'pg_cron'::text AS run_log,
    j.jobname AS run_key,
    (d.runid)::text AS run_id,
    d.start_time AS started_at,
    d.end_time AS finished_at,
        CASE d.status
            WHEN 'succeeded'::text THEN 'success'::text
            WHEN 'failed'::text THEN 'failed'::text
            WHEN 'running'::text THEN 'running'::text
            ELSE d.status
        END AS status,
    NULL::bigint AS rows_changed,
        CASE
            WHEN (d.status = 'failed'::text) THEN d.return_message
            ELSE NULL::text
        END AS error
   FROM (cron.job_run_details d
     JOIN cron.job j ON ((j.jobid = d.jobid)))
  WHERE (d.start_time > (now() - '30 days'::interval))
UNION ALL
 SELECT 'fixture_refresh_runs'::text AS run_log,
    'fixture_refresh'::text AS run_key,
    (fixture_refresh_runs.refresh_run_id)::text AS run_id,
    fixture_refresh_runs.started_at,
    fixture_refresh_runs.finished_at,
    fixture_refresh_runs.status,
    NULL::bigint AS rows_changed,
    fixture_refresh_runs.error_message AS error
   FROM fixture_refresh_runs
  WHERE (fixture_refresh_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'broadcast_sync_runs'::text AS run_log,
        CASE broadcast_sync_runs.source
            WHEN 'airtable'::text THEN 'airtable_broadcasts'::text
            ELSE broadcast_sync_runs.source
        END AS run_key,
    (broadcast_sync_runs.run_id)::text AS run_id,
    broadcast_sync_runs.ran_at AS started_at,
    broadcast_sync_runs.ran_at AS finished_at,
    'success'::text AS status,
    ((COALESCE(broadcast_sync_runs.inserted, 0) + COALESCE(broadcast_sync_runs.updated, 0)))::bigint AS rows_changed,
    NULL::text AS error
   FROM broadcast_sync_runs
  WHERE (broadcast_sync_runs.ran_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'fpl_ingestion_runs'::text AS run_log,
    'refresh_fpl'::text AS run_key,
    (fpl_ingestion_runs.run_id)::text AS run_id,
    fpl_ingestion_runs.started_at,
    fpl_ingestion_runs.completed_at AS finished_at,
    fpl_ingestion_runs.status,
    NULL::bigint AS rows_changed,
    fpl_ingestion_runs.error_message AS error
   FROM fpl_ingestion_runs
  WHERE (fpl_ingestion_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'result_ingestion_runs'::text AS run_log,
    result_ingestion_runs.source_name AS run_key,
    (result_ingestion_runs.ingestion_run_id)::text AS run_id,
    result_ingestion_runs.started_at,
    result_ingestion_runs.finished_at,
    result_ingestion_runs.status,
    (
        CASE
            WHEN ((result_ingestion_runs.matches_inserted IS NULL) AND (result_ingestion_runs.matches_changed IS NULL)) THEN NULL::integer
            ELSE (COALESCE(result_ingestion_runs.matches_inserted, 0) + COALESCE(result_ingestion_runs.matches_changed, 0))
        END)::bigint AS rows_changed,
    result_ingestion_runs.error_message AS error
   FROM result_ingestion_runs
  WHERE (result_ingestion_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'match_import_runs'::text AS run_log,
    match_import_runs.league_code AS run_key,
    (match_import_runs.import_run_id)::text AS run_id,
    match_import_runs.started_at,
    match_import_runs.finished_at,
    match_import_runs.status,
    NULL::bigint AS rows_changed,
    match_import_runs.error_message AS error
   FROM match_import_runs
  WHERE (match_import_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'fpl_live_runs'::text AS run_log,
    'fpl_live'::text AS run_key,
    (fpl_live_runs.run_id)::text AS run_id,
    fpl_live_runs.run_at AS started_at,
    fpl_live_runs.run_at AS finished_at,
    fpl_live_runs.status,
    (fpl_live_runs.elements_changed)::bigint AS rows_changed,
    fpl_live_runs.error
   FROM fpl_live_runs
  WHERE (fpl_live_runs.run_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'finance_ingestion_runs'::text AS run_log,
    finance_ingestion_runs.source AS run_key,
    (finance_ingestion_runs.ingestion_run_id)::text AS run_id,
    finance_ingestion_runs.started_at,
    finance_ingestion_runs.completed_at AS finished_at,
    finance_ingestion_runs.status,
    (finance_ingestion_runs.facts_extracted)::bigint AS rows_changed,
    NULL::text AS error
   FROM finance_ingestion_runs
  WHERE (finance_ingestion_runs.started_at > (now() - '30 days'::interval));
