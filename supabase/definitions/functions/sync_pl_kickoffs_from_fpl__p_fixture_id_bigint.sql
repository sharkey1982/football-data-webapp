-- Live definition exported from the database (function sync_pl_kickoffs_from_fpl(p_fixture_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sync_pl_kickoffs_from_fpl(p_fixture_id bigint DEFAULT NULL::bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_n int;
begin
  with src as (
    select f.fixture_id, f.kickoff_date old_date, f.kickoff_time old_time, f.status,
           (ff.kickoff_time at time zone 'Europe/London')::date new_date,
           (ff.kickoff_time at time zone 'Europe/London')::time new_time,
           ff.kickoff_time ko
      from public.fpl_fixtures ff
      join public.fixtures f on f.fixture_id = ff.canonical_fixture_id and f.season_id = ff.season_id
     where ff.kickoff_time is not null
       and (p_fixture_id is null or f.fixture_id = p_fixture_id)
  ), changed as (
    select * from src where old_date <> new_date or old_time is distinct from new_time
  ), logged as (
    insert into public.fixture_changes (fixture_id, old_kickoff_date, new_kickoff_date, old_kickoff_time, new_kickoff_time)
    select fixture_id, old_date, new_date, old_time, new_time from changed
    returning 1
  ), upd as (
    update public.fixtures f
       set kickoff_date = c.new_date,
           kickoff_time = c.new_time,
           -- Same time-based rule refresh_fixture_feeds applies; a fixture
           -- moved into the future is scheduled again.
           status = case when c.ko > now() then 'scheduled'
                         when f.status = 'scheduled' then 'played'
                         else f.status end,
           updated_at = now()
      from changed c
     where f.fixture_id = c.fixture_id
    returning 1
  )
  select count(*) into v_n from upd;  -- "logged" runs too: data-modifying CTEs always execute
  return v_n;
end;
$function$
;
