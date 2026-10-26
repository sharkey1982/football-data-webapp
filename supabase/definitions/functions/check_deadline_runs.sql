-- Live definition exported from the database (function check_deadline_runs()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_deadline_runs()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with d as (
    select g.fpl_event_id, g.deadline_time
      from public.fpl_gameweeks g
     where g.season_id = public.fpl_current_season_id()
       and g.deadline_time < now() and g.deadline_time > now() - interval '8 days'
     order by g.deadline_time desc limit 1
  ),
  j(job, label) as (values ('refresh_fpl_projections', 'FPL projections'), ('ffs_team_news', 'FFS team news')),
  r as (
    select j.job, j.label, d.fpl_event_id, d.deadline_time,
           (select max(p.finished_at) from public.pipeline_runs p
             where p.job_name = j.job and p.status = 'success' and p.finished_at < d.deadline_time) as last_ok
      from j cross join d
  ),
  graded as (
    select r.*,
           case when r.last_ok >= r.deadline_time - interval '6 hours' then 'ok'
                when r.last_ok >= r.deadline_time - interval '12 hours' then 'warning'
                when r.deadline_time < timestamptz '2026-10-23 00:00+00' then 'warning'
                else 'failed' end as grade
      from r
  ),
  disp as (
    select count(*) filter (where x.n_failed >= s.max_attempts and not x.any_ok) as dead,
           string_agg(x.slot_key || ' ' || to_char(x.due_at at time zone 'UTC', 'DD Mon HH24:MI'), ', ')
             filter (where x.n_failed >= s.max_attempts and not x.any_ok) as names,
           bool_and(s.enabled) as enabled
      from private.workflow_dispatch_settings s
      left join (
        select w.slot_key, w.due_at, count(*) filter (where w.outcome = 'failed') as n_failed, bool_or(w.outcome = 'ok') as any_ok
          from private.workflow_dispatches w
         where w.due_at > now() - interval '2 days'
         group by w.slot_key, w.due_at) x on true
     where s.id
  )
  select 'deadline_run_' || g.job, g.grade,
         coalesce(round(extract(epoch from g.deadline_time - g.last_ok) / 60)::bigint, -1),
         format('Minutes between the last successful %s run and the GW%s deadline %s UTC (last %s; ok within 6 h, warns within 12 h; -1 = none)',
                g.label, g.fpl_event_id, to_char(g.deadline_time at time zone 'UTC', 'DD Mon HH24:MI'),
                coalesce(to_char(g.last_ok at time zone 'UTC', 'DD Mon HH24:MI'), 'none'))
    from graded g
  union all
  select 'workflow_dispatcher',
         case when not coalesce(disp.enabled, false) then 'warning' when disp.dead > 0 then 'failed' else 'ok' end,
         coalesce(disp.dead, 0),
         case when not coalesce(disp.enabled, false) then 'pg_cron workflow dispatcher is disabled (private.workflow_dispatch_settings)'
              else 'Slots in the last 2 days whose every dispatch attempt failed (private.workflow_dispatches): ' || coalesce(disp.names, 'none') end
    from disp
$function$
;
