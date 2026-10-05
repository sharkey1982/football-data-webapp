-- ============================================================================
-- Tennis summary rebuild on a schedule (pg_cron), as the site's other jobs.
--
-- public.tennis_refresh() takes about a minute: longer than the API's
-- statement limit, so the importer can't call it (it timed out on 5 Oct),
-- and the GitHub route needs a database URL secret that isn't set. pg_cron
-- runs inside the database with no such limit. Every two hours it rebuilds
-- events, editions and player summaries, but only when matches have been
-- imported since the last successful rebuild. Logs pipeline_runs
-- (tennis_refresh) when it rebuilds.
-- ============================================================================

create or replace function public.tennis_refresh_if_stale(p_force boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare run bigint; result text; last_ok timestamptz;
begin
  select max(started_at) into last_ok from public.pipeline_runs where job_name = 'tennis_refresh' and status = 'success';
  if not p_force and coalesce((select max(imported_at) from tennis.matches) <= last_ok, false) then
    return 'up to date';
  end if;
  insert into public.pipeline_runs (job_name, status) values ('tennis_refresh', 'running') returning run_id into run;
  begin
    result := public.tennis_refresh();
    update public.pipeline_runs set status = 'success', summary = result, finished_at = now() where run_id = run;
  exception when others then
    update public.pipeline_runs set status = 'failed', error_message = left(sqlerrm, 4000), finished_at = now() where run_id = run;
    result := 'failed: ' || sqlerrm;
  end;
  return result;
end $$;
revoke all on function public.tennis_refresh_if_stale(boolean) from public, anon, authenticated;
grant execute on function public.tennis_refresh_if_stale(boolean) to service_role;

select cron.unschedule('tennis-refresh-2-hourly') where exists (select 1 from cron.job where jobname = 'tennis-refresh-2-hourly');
select cron.schedule('tennis-refresh-2-hourly', '37 */2 * * *', $$select public.tennis_refresh_if_stale();$$);

-- Catch up now (the 5 Oct import's rebuild timed out).
select public.tennis_refresh_if_stale(true);
