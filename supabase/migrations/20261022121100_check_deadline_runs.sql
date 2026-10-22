-- ============================================================================
-- public.check_deadline_runs() (audit P-06, 22 Oct 2026): did the last FPL
-- projections and FFS team news before each deadline run close enough to it,
-- and is the pg_cron workflow dispatcher (P-01) working?
--
-- Area "deadlines" in scripts/run_integrity_checks.py. For the latest
-- deadline that has passed (within 8 days): the last successful run before
-- it must have finished within 6 h (ok), 12 h (warning), else failed. Before
-- the dispatcher (deadlines up to 22 Oct) a miss is only a warning: GW7's
-- last runs were 12 h and 14 h early (GitHub cron delays). Safe to re-run.
-- ============================================================================
create or replace function public.check_deadline_runs()
returns table (check_name text, status text, found bigint, detail text)
language sql stable
security definer
set search_path = ''
as $$
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
$$;
revoke all on function public.check_deadline_runs() from public, anon, authenticated;
grant execute on function public.check_deadline_runs() to service_role;
