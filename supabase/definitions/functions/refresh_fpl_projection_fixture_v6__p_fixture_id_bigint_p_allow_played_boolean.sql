-- Live definition exported from the database (function refresh_fpl_projection_fixture_v6(p_fixture_id bigint, p_allow_played boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl_projection_fixture_v6(p_fixture_id bigint, p_allow_played boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
  v_rows integer;
begin
  if not p_allow_played then
    select status into v_status from public.fixtures where fixture_id = p_fixture_id;
    if v_status = 'played' then
      -- Nothing written, and deliberately not an error: the routine
      -- pipeline sweeps a matchweek range that may include just-played
      -- fixtures, and that is normal, not a failure.
      return 0;
    end if;
  end if;

  select public.refresh_fpl_projection_fixture_v6_impl(p_fixture_id) into v_rows;
  return v_rows;
end;
$function$
;
