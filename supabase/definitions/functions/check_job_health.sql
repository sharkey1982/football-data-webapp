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
  select 'smoke_tests_passed',
    case when r.smoke_run_id is null then 'warning' when r.pages_failed > 0 then 'failed' when r.pages_warned > 0 then 'warning' else 'ok' end,
    coalesce(r.pages_failed, 0)::bigint,
    coalesce('Latest production smoke run ' || to_char(r.started_at, 'YYYY-MM-DD HH24:MI') || ': ' || r.summary, 'No production smoke run yet (weekly-smoke.yml)')
  from (select 1) one
  left join lateral (select * from public.smoke_runs where kind = 'production' order by started_at desc limit 1) r on true
  union all
  select 'smoke_performance_trend',
    case when cur.median_lcp_ms is null or prev.median_lcp_ms is null then 'ok'
         when cur.median_lcp_ms > prev.median_lcp_ms * 1.2 then 'warning' else 'ok' end,
    coalesce(cur.median_lcp_ms, 0)::bigint,
    'Median LCP of the latest production smoke run vs the one before: ' || coalesce(cur.median_lcp_ms::text, '-') || ' ms vs ' || coalesce(prev.median_lcp_ms::text, '-') || ' ms (warns above +20%)'
  from (select 1) one
  left join lateral (select median_lcp_ms from public.smoke_runs where kind = 'production' order by started_at desc limit 1) cur on true
  left join lateral (select median_lcp_ms from public.smoke_runs where kind = 'production' order by started_at desc offset 1 limit 1) prev on true
  union all
  select 'jobs_registry_gaps', case when count(*) = 0 then 'ok' else 'warning' end, count(*),
    'Jobs missing from public.job_registry or never run: ' || coalesce(string_agg(gap || ': ' || name, '; ' order by gap, name), 'none')
  from public.job_registry_gaps
$function$
;
