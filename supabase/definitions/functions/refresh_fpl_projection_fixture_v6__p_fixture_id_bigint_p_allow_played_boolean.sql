-- Live definition exported from the database (function refresh_fpl_projection_fixture_v6(p_fixture_id bigint, p_allow_played boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl_projection_fixture_v6(p_fixture_id bigint, p_allow_played boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
  v_kickoff timestamptz;
  v_rows integer;
begin
  if not p_allow_played then
    select f.status,
           coalesce(ff.kickoff_time,
                    ((f.kickoff_date + coalesce(f.kickoff_time, '00:00'::time)) at time zone 'Europe/London'))
      into v_status, v_kickoff
      from public.fixtures f
      left join public.fpl_fixtures ff on ff.canonical_fixture_id = f.fixture_id and ff.season_id = f.season_id
     where f.fixture_id = p_fixture_id
     limit 1;
    if v_status = 'played' or v_kickoff <= now() then
      -- Nothing written, and deliberately not an error: the routine
      -- pipeline sweeps a matchweek range that may include fixtures under
      -- way or just played. Frozen at kick-off (22 Oct 2026): what is
      -- stored is what was shown before the match.
      return 0;
    end if;
  end if;

  select public.refresh_fpl_projection_fixture_v6_impl(p_fixture_id) into v_rows;
  return v_rows;
end;
$function$
;
