-- Live definition exported from the database (function tennis_refresh_if_stale(p_force boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.tennis_refresh_if_stale(p_force boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare run bigint; result text; last_ok timestamptz;
begin
  select max(started_at) into last_ok from public.pipeline_runs where job_name = 'tennis_refresh' and status = 'success';
  if not p_force and coalesce((select max(imported_at) from tennis.matches) <= last_ok, false) then
    return 'up to date';
  end if;
  insert into public.pipeline_runs (job_name, status, started_at) values ('tennis_refresh', 'running', clock_timestamp()) returning run_id into run;
  begin
    result := public.tennis_refresh();
    update public.pipeline_runs set status = 'success', summary = result, finished_at = clock_timestamp() where run_id = run;
  exception when others then
    update public.pipeline_runs set status = 'failed', error_message = left(sqlerrm, 4000), finished_at = clock_timestamp() where run_id = run;
    result := 'failed: ' || sqlerrm;
  end;
  return result;
end $function$
;
