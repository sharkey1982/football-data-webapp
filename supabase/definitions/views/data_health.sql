-- Live definition exported from the database (view data_health).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.data_health with (security_invoker=true) as
 WITH fixture_last AS (
         SELECT fixture_refresh_runs.started_at,
            fixture_refresh_runs.finished_at,
            fixture_refresh_runs.status,
            fixture_refresh_runs.rows_seen,
            fixture_refresh_runs.rows_updated,
            fixture_refresh_runs.error_message,
            row_number() OVER (ORDER BY fixture_refresh_runs.started_at DESC) AS rn
           FROM fixture_refresh_runs
        ), result_last AS (
         SELECT result_ingestion_runs.started_at,
            result_ingestion_runs.finished_at,
            result_ingestion_runs.status,
            result_ingestion_runs.rows_seen,
            result_ingestion_runs.matches_upserted,
            result_ingestion_runs.matches_inserted,
            result_ingestion_runs.matches_changed,
            result_ingestion_runs.matches_unchanged,
            result_ingestion_runs.unmatched_rows,
            result_ingestion_runs.error_message,
            row_number() OVER (ORDER BY result_ingestion_runs.started_at DESC) AS rn
           FROM result_ingestion_runs
        ), prediction_stats AS (
         SELECT count(*) FILTER (WHERE (fixtures.status = ANY (ARRAY['scheduled'::text, 'postponed'::text]))) AS future_fixtures,
            count(*) FILTER (WHERE ((fixtures.status = ANY (ARRAY['scheduled'::text, 'postponed'::text])) AND (fixtures.prediction_fit_run_id IS NOT NULL))) AS predicted_future_fixtures,
            max(fixtures.predicted_at) FILTER (WHERE (fixtures.status = ANY (ARRAY['scheduled'::text, 'postponed'::text]))) AS last_predicted_at
           FROM fixtures
        ), model_stats AS (
         SELECT max(model_fit_runs.fitted_at) AS last_model_fit_at,
            count(DISTINCT model_fit_runs.league_id) AS leagues_with_fit
           FROM model_fit_runs
        )
 SELECT 'Fixtures'::text AS component,
    f.started_at AS last_attempt_at,
        CASE
            WHEN (f.status = 'success'::text) THEN f.finished_at
            ELSE NULL::timestamp with time zone
        END AS last_success_at,
        CASE
            WHEN (f.status = 'success'::text) THEN 'Healthy'::text
            ELSE 'Warning'::text
        END AS health_status,
    f.status AS run_status,
    (f.rows_seen)::bigint AS rows_seen,
    (f.rows_updated)::bigint AS rows_changed,
    NULL::bigint AS rows_inserted,
    NULL::bigint AS rows_unchanged,
    NULL::bigint AS unmatched_rows,
    f.error_message AS details
   FROM fixture_last f
  WHERE (f.rn = 1)
UNION ALL
 SELECT 'League Results'::text AS component,
    r.started_at AS last_attempt_at,
    ( SELECT max(result_ingestion_runs.finished_at) AS max
           FROM result_ingestion_runs
          WHERE (result_ingestion_runs.status = 'success'::text)) AS last_success_at,
        CASE
            WHEN ((r.status = 'success'::text) AND ((r.matches_inserted + r.matches_changed) = 0)) THEN 'No change'::text
            WHEN (r.status = 'success'::text) THEN 'Healthy'::text
            WHEN ((r.status = 'running'::text) AND (r.started_at < (now() - '00:20:00'::interval))) THEN 'Stale'::text
            ELSE 'Warning'::text
        END AS health_status,
    r.status AS run_status,
    (r.rows_seen)::bigint AS rows_seen,
    (r.matches_changed)::bigint AS rows_changed,
    (r.matches_inserted)::bigint AS rows_inserted,
    (r.matches_unchanged)::bigint AS rows_unchanged,
    (r.unmatched_rows)::bigint AS unmatched_rows,
    r.error_message AS details
   FROM result_last r
  WHERE (r.rn = 1)
UNION ALL
 SELECT 'Predictions'::text AS component,
    p.last_predicted_at AS last_attempt_at,
    p.last_predicted_at AS last_success_at,
        CASE
            WHEN (p.predicted_future_fixtures > 0) THEN 'Healthy'::text
            ELSE 'Warning'::text
        END AS health_status,
    'snapshot'::text AS run_status,
    p.future_fixtures AS rows_seen,
    p.predicted_future_fixtures AS rows_changed,
    NULL::bigint AS rows_inserted,
    (p.future_fixtures - p.predicted_future_fixtures) AS rows_unchanged,
    NULL::bigint AS unmatched_rows,
    concat(p.predicted_future_fixtures, ' of ', p.future_fixtures, ' future fixtures have predictions') AS details
   FROM prediction_stats p
UNION ALL
 SELECT 'Model Fit'::text AS component,
    m.last_model_fit_at AS last_attempt_at,
    m.last_model_fit_at AS last_success_at,
        CASE
            WHEN (m.last_model_fit_at > (now() - '30 days'::interval)) THEN 'Healthy'::text
            ELSE 'Warning'::text
        END AS health_status,
    'snapshot'::text AS run_status,
    m.leagues_with_fit AS rows_seen,
    NULL::bigint AS rows_changed,
    NULL::bigint AS rows_inserted,
    NULL::bigint AS rows_unchanged,
    NULL::bigint AS unmatched_rows,
    concat(m.leagues_with_fit, ' competitions have model fits') AS details
   FROM model_stats m;
