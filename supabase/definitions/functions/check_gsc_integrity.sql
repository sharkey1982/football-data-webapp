-- Live definition exported from the database (function check_gsc_integrity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_gsc_integrity()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'gsc_import_fresh',
    case when age_days is null then 'warning' when age_days >= 4 then 'failed' when age_days >= 2 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful Search Console import (daily; warns at 2, fails at 4; -1 = never run)'
  from (select (current_date - max(finished_at)::date) age_days
        from gsc.import_runs where status in ('success', 'warning')) x
  union all
  select 'gsc_data_fresh',
    case when lag_days is null then 'warning' when lag_days >= 8 then 'failed' when lag_days >= 5 then 'warning' else 'ok' end,
    coalesce(lag_days, -1)::bigint,
    'Days between today and the latest Search Console date with data (Google lags 1-3 days; warns at 5, fails at 8; -1 = no data)'
  from (select (current_date - max(date)) lag_days
        from gsc.daily_totals where impressions > 0) x
  union all
  -- Independent reconciliation: device and country rows are aggregated by
  -- property like the totals, so each day's breakdown must add up to it.
  select 'gsc_breakdowns_reconcile', case when n = 0 then 'ok' else 'warning' end, n,
    'Days in the last 60 where clicks or impressions by device or by country differ from the daily total by more than 1% (and 2)'
  from (select count(*) n from gsc.daily_totals t
        left join lateral (select coalesce(sum(clicks), 0) c, coalesce(sum(impressions), 0) i
                           from gsc.daily_by_device d
                           where d.site_url = t.site_url and d.search_type = t.search_type and d.date = t.date) dv on true
        left join lateral (select coalesce(sum(clicks), 0) c, coalesce(sum(impressions), 0) i
                           from gsc.daily_by_country c
                           where c.site_url = t.site_url and c.search_type = t.search_type and c.date = t.date) ct on true
        where t.date >= current_date - 60
          and (   (abs(dv.c - t.clicks) > greatest(2, 0.01 * t.clicks))
               or (abs(dv.i - t.impressions) > greatest(2, 0.01 * t.impressions))
               or (abs(ct.c - t.clicks) > greatest(2, 0.01 * t.clicks))
               or (abs(ct.i - t.impressions) > greatest(2, 0.01 * t.impressions)))) x
  union all
  select 'gsc_calendar_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Missing days in gsc.daily_totals between its first and last date (each run stores zero days, so a gap is a load fault)'
  from (select count(*) n
        from (select site_url, search_type, min(date) lo, max(date) hi
              from gsc.daily_totals group by 1, 2) b
        cross join lateral generate_series(b.lo, b.hi, interval '1 day') g(d)
        where not exists (select 1 from gsc.daily_totals t
                          where t.site_url = b.site_url and t.search_type = b.search_type and t.date = g.d::date)) x
  union all
  select 'gsc_runs_failed_7d', case when n = 0 then 'ok' else 'warning' end, n,
    'Failed Search Console import runs in the last 7 days (gsc.import_runs.error_message has the reason)'
  from (select count(*) n from gsc.import_runs
        where status = 'failed' and started_at >= now() - interval '7 days') x
$function$
;
