-- Live definition exported from the database (view job_registry_gaps).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.job_registry_gaps as
 SELECT 'pg_cron job not registered'::text AS gap,
    j.jobname AS name
   FROM cron.job j
  WHERE (j.active AND (NOT (EXISTS ( SELECT 1
           FROM job_registry r
          WHERE (r.job_key = j.jobname)))))
UNION ALL
 SELECT 'pipeline_runs job not registered'::text AS gap,
    p.job_name AS name
   FROM ( SELECT DISTINCT pipeline_runs.job_name
           FROM pipeline_runs
          WHERE (pipeline_runs.started_at > (now() - '30 days'::interval))) p
  WHERE (NOT (EXISTS ( SELECT 1
           FROM job_registry r
          WHERE ((r.run_log = 'pipeline_runs'::text) AND (p.job_name ~ r.run_key)))))
UNION ALL
 SELECT 'registered job with no run in 30 days'::text AS gap,
    h.job_key AS name
   FROM job_health h
  WHERE (h.health_status = 'never_run'::text);
