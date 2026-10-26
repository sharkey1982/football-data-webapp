-- Live definition exported from the database (view job_health).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.job_health as
 WITH runs AS (
         SELECT r_1.job_key,
            u.run_log,
            u.run_key,
            u.run_id,
            u.started_at,
            u.finished_at,
                CASE
                    WHEN (r_1.outcome_is_check AND (u.status = ANY (ARRAY['failed'::text, 'warning'::text])) AND (u.finished_at IS NOT NULL)) THEN 'success'::text
                    ELSE u.status
                END AS status,
            u.rows_changed,
                CASE
                    WHEN r_1.outcome_is_check THEN NULL::text
                    ELSE u.error
                END AS error,
            row_number() OVER (PARTITION BY r_1.job_key ORDER BY u.started_at DESC) AS rn
           FROM (job_registry r_1
             JOIN job_runs_unified u ON (((u.run_log = r_1.run_log) AND (u.run_key ~ r_1.run_key))))
          WHERE (r_1.active AND (r_1.run_log <> 'none'::text))
        ), agg AS (
         SELECT runs.job_key,
            max(runs.started_at) AS last_attempt,
            max(COALESCE(runs.finished_at, runs.started_at)) FILTER (WHERE (runs.status = ANY (ARRAY['success'::text, 'warning'::text]))) AS last_success,
            count(*) FILTER (WHERE ((runs.status = 'failed'::text) AND (runs.started_at > (now() - '7 days'::interval)))) AS failures_7d,
            count(*) FILTER (WHERE (runs.started_at > (now() - '7 days'::interval))) AS runs_7d
           FROM runs
          GROUP BY runs.job_key
        ), last_run AS (
         SELECT runs.job_key,
            runs.run_log,
            runs.run_key,
            runs.run_id,
            runs.started_at,
            runs.finished_at,
            runs.status,
            runs.rows_changed,
            runs.error,
            runs.rn
           FROM runs
          WHERE (runs.rn = 1)
        ), stuck AS (
         SELECT r_1.job_key,
            count(*) AS stuck_runs
           FROM (runs ru
             JOIN job_registry r_1 ON ((r_1.job_key = ru.job_key)))
          WHERE ((ru.status = 'running'::text) AND (ru.started_at < (now() - r_1.max_duration)))
          GROUP BY r_1.job_key
        )
 SELECT r.job_key,
    r.area,
    r.location,
    r.schedule,
    r.expected_interval,
    r.max_duration,
    r.run_log,
    r.upstream,
    r.output_check,
    a.last_attempt,
    a.last_success,
    l.status AS last_status,
    (l.finished_at - l.started_at) AS last_duration,
    l.rows_changed AS last_rows_changed,
    "left"(l.error, 500) AS last_error,
    COALESCE(a.failures_7d, (0)::bigint) AS failures_7d,
    COALESCE(a.runs_7d, (0)::bigint) AS runs_7d,
    COALESCE(s.stuck_runs, (0)::bigint) AS stuck_runs,
        CASE
            WHEN (r.run_log = 'none'::text) THEN 'not_logged'::text
            WHEN (a.last_attempt IS NULL) THEN
            CASE
                WHEN (r.expected_interval IS NULL) THEN 'not_scheduled'::text
                WHEN (r.registered_at > ((now() - r.expected_interval) - r.max_duration)) THEN 'awaiting_first_run'::text
                ELSE 'never_run'::text
            END
            WHEN (COALESCE(s.stuck_runs, (0)::bigint) > 0) THEN 'stuck'::text
            WHEN (l.status = 'running'::text) THEN 'running'::text
            WHEN ((r.expected_interval IS NOT NULL) AND (COALESCE(a.last_success, '-infinity'::timestamp with time zone) < (((now() - r.expected_interval) - r.max_duration) - '01:00:00'::interval))) THEN 'stale'::text
            WHEN ((l.status = 'failed'::text) AND (l.error ~* '(statement timeout|57014|timed out|timeout)'::text)) THEN 'timed_out'::text
            WHEN (l.status = 'failed'::text) THEN 'failed'::text
            WHEN (l.status = 'warning'::text) THEN 'warning'::text
            WHEN (l.rows_changed > 0) THEN 'success_changed'::text
            WHEN (l.rows_changed = 0) THEN 'success_no_change'::text
            ELSE 'success'::text
        END AS health_status,
    r.notes
   FROM (((job_registry r
     LEFT JOIN agg a ON ((a.job_key = r.job_key)))
     LEFT JOIN last_run l ON ((l.job_key = r.job_key)))
     LEFT JOIN stuck s ON ((s.job_key = r.job_key)))
  WHERE r.active;
