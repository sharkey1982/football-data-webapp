-- Live definition exported from the database (function refresh_fpl_fixture_availability()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl_fixture_availability()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rows integer;
begin
  delete from public.fpl_fixture_availability_store;
  insert into public.fpl_fixture_availability_store
    select v.*, now() from public.fpl_player_fixture_availability v;
  get diagnostics v_rows = row_count;
  -- Start records change with the same gameweek data (5 Oct 2026).
  perform public.refresh_fpl_start_record();
  return v_rows;
end $function$
;
