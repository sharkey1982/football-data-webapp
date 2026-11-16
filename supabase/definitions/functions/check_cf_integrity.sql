-- Live definition exported from the database (function check_cf_integrity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_cf_integrity()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'cf_import_fresh',
    case when age_h is null then 'warning' when age_h >= 30 then 'failed' when age_h >= 12 then 'warning' else 'ok' end,
    coalesce(age_h, -1)::bigint,
    'Hours since the last successful Cloudflare Web Analytics import (cf-import runs 6 times a day; warns at 12, fails at 30; -1 = never run)'
  from (select floor(extract(epoch from now() - max(finished_at)) / 3600) age_h
          from cf.import_runs where status in ('success', 'warning')) x
  union all
  select 'cf_data_fresh',
    case when lag_days is null then 'warning' when lag_days >= 4 then 'failed' when lag_days >= 2 then 'warning' else 'ok' end,
    coalesce(lag_days, -1)::bigint,
    'Days between today (UK) and the latest Cloudflare date with visits (warns at 2, fails at 4; -1 = no data)'
  from (select ((now() at time zone 'Europe/London')::date - max(date)) lag_days from cf.daily_totals where page_views > 0) x
  union all
  select 'cf_pages_reconcile', case when n = 0 then 'ok' else 'warning' end, n,
    'Days in the last 60 where page views by path do not add up to the day''s total (each comes from the same request, so they should match)'
  from (select count(*) n from cf.daily_totals t
          left join lateral (select coalesce(sum(page_views), 0) v from cf.daily_by_page p where p.date = t.date) p on true
         where t.date >= current_date - 60 and p.v <> t.page_views) x
  union all
  select 'cf_calendar_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Missing days in cf.daily_totals between its first and last date (every fetched date is stored, zero or not, so a gap is a load fault)'
  from (select count(*) n
          from (select min(date) lo, max(date) hi from cf.daily_totals) b
          cross join lateral generate_series(b.lo, b.hi, interval '1 day') g(d)
         where b.lo is not null and not exists (select 1 from cf.daily_totals t where t.date = g.d::date)) x
  union all
  select 'cf_runs_failed_24h', case when n = 0 then 'ok' else 'warning' end, n,
    'Failed Cloudflare imports in the last 24 hours (cf.import_runs.error_message has the reason)'
  from (select count(*) n from cf.import_runs where status = 'failed' and started_at >= now() - interval '24 hours') x
$function$
;
