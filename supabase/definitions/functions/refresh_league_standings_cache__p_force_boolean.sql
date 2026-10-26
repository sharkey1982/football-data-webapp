-- Live definition exported from the database (function refresh_league_standings_cache(p_force boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_league_standings_cache(p_force boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fp text; t0 timestamptz := clock_timestamp(); n int; run bigint;
begin
  fp := public.league_standings_fingerprint();
  if not p_force and fp is not distinct from (select s.fingerprint from public.league_standings_cache_state s where s.id = 1) then
    return 'up to date';
  end if;
  insert into public.pipeline_runs (job_name, status, started_at) values ('league_standings_cache', 'running', t0) returning run_id into run;
  delete from public.league_standings_cache where true;
  insert into public.league_standings_cache select * from public.league_standings_live;
  get diagnostics n = row_count;
  update public.league_standings_cache_state
     set fingerprint = fp, refreshed_at = clock_timestamp(), rows_cached = n,
         duration_ms = (extract(epoch from clock_timestamp() - t0) * 1000)::int
   where id = 1;
  update public.pipeline_runs set status = 'success', finished_at = clock_timestamp(), rows_changed = n,
         summary = n || ' team-seasons cached in ' || (extract(epoch from clock_timestamp() - t0) * 1000)::int || ' ms'
   where run_id = run;
  return 'refreshed ' || n;
end $function$
;
