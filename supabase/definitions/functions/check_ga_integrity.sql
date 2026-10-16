-- Live definition exported from the database (function check_ga_integrity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_ga_integrity()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'ga_import_fresh',
    case when age_days is null then 'warning' when age_days >= 4 then 'failed' when age_days >= 2 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful Google Analytics import (daily; warns at 2, fails at 4; -1 = never run)'
  from (select (current_date - max(finished_at)::date) age_days
        from ga.import_runs where status in ('success', 'warning')) x
  union all
  select 'ga_data_fresh',
    case when lag_days is null then 'warning' when lag_days >= 7 then 'failed' when lag_days >= 4 then 'warning' else 'ok' end,
    coalesce(lag_days, -1)::bigint,
    'Days between today and the latest Google Analytics date with sessions (warns at 4, fails at 7; -1 = no data). Only consenting visitors are counted, so a quiet spell can warn'
  from (select (current_date - max(date)) lag_days from ga.daily_totals where sessions > 0) x
  union all
  -- Sessions are additive, so device and country breakdowns must add up to
  -- the day's total.
  select 'ga_breakdowns_reconcile', case when n = 0 then 'ok' else 'warning' end, n,
    'Days in the last 60 where sessions by device or by country differ from the daily total by more than 2% (and 2)'
  from (select count(*) n from ga.daily_totals t
        left join lateral (select coalesce(sum(sessions), 0) s from ga.daily_by_device d
                           where d.property_id = t.property_id and d.date = t.date) dv on true
        left join lateral (select coalesce(sum(sessions), 0) s from ga.daily_by_country c
                           where c.property_id = t.property_id and c.date = t.date) ct on true
        where t.date >= current_date - 60
          and (abs(dv.s - t.sessions) > greatest(2, 0.02 * t.sessions)
               or abs(ct.s - t.sessions) > greatest(2, 0.02 * t.sessions))) x
  union all
  select 'ga_calendar_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Missing days in ga.daily_totals between its first and last date (each run stores zero days, so a gap is a load fault)'
  from (select count(*) n
        from (select property_id, min(date) lo, max(date) hi from ga.daily_totals group by 1) b
        cross join lateral generate_series(b.lo, b.hi, interval '1 day') g(d)
        where not exists (select 1 from ga.daily_totals t where t.property_id = b.property_id and t.date = g.d::date)) x
  union all
  select 'ga_runs_failed_7d', case when n = 0 then 'ok' else 'warning' end, n,
    'Failed Google Analytics import runs in the last 7 days (ga.import_runs.error_message has the reason)'
  from (select count(*) n from ga.import_runs where status = 'failed' and started_at >= now() - interval '7 days') x
$function$
;
