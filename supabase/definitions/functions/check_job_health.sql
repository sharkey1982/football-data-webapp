-- Live definition exported from the database (function check_job_health()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_job_health()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'jobs_failed', case when count(*) = 0 then 'ok' else 'failed' end, count(*),
    'Jobs whose latest run failed or timed out: ' || coalesce(string_agg(job_key || ' (' || health_status || coalesce(': ' || left(last_error, 80), '') || ')', '; ' order by job_key), 'none')
  from public.job_health where health_status in ('failed', 'timed_out')
  union all
  select 'jobs_stale', case when count(*) = 0 then 'ok' else 'failed' end, count(*),
    'Jobs with no successful run within their expected interval: ' || coalesce(string_agg(job_key || ' (last success ' || coalesce(to_char(last_success, 'YYYY-MM-DD HH24:MI'), 'never') || ')', '; ' order by job_key), 'none')
  from public.job_health where health_status = 'stale'
  union all
  select 'jobs_stuck', case when count(*) = 0 then 'ok' else 'failed' end, coalesce(sum(stuck_runs), 0)::bigint,
    'Runs still "running" past their job''s max_duration: ' || coalesce(string_agg(job_key || ' x' || stuck_runs, '; ' order by job_key), 'none')
  from public.job_health where stuck_runs > 0
  union all
  select 'jobs_recent_failures', case when count(*) = 0 then 'ok' else 'warning' end, coalesce(sum(failures_7d), 0)::bigint,
    'Jobs now healthy but with failed runs in the last 7 days (a later success does not erase them): ' || coalesce(string_agg(job_key || ' x' || failures_7d, '; ' order by job_key), 'none')
  from public.job_health where failures_7d > 0 and health_status not in ('failed', 'timed_out', 'stale', 'stuck')
  union all
  select 'jobs_registry_gaps', case when count(*) = 0 then 'ok' else 'warning' end, count(*),
    'Jobs missing from public.job_registry or never run: ' || coalesce(string_agg(gap || ': ' || name, '; ' order by gap, name), 'none')
  from public.job_registry_gaps
$function$
;
