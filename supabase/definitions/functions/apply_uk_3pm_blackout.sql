-- Live definition exported from the database (function apply_uk_3pm_blackout()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.apply_uk_3pm_blackout()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n_del int;
  n_ins int;
begin
  -- Rule rows that no longer apply: another row now exists for the
  -- fixture, the fixture has moved out of the blackout window (by its own
  -- date/time or, for the Premier League, by FPL's official kick-off), or it
  -- is postponed.
  with gone as (
    delete from public.fixture_broadcasts fb
    where fb.source = 'rule:3pm_blackout' and fb.airtable_record_id is null
      and (
        exists (select 1 from public.fixture_broadcasts o
                where o.fixture_id = fb.fixture_id and o.market = fb.market and o.broadcast_id <> fb.broadcast_id)
        or exists (select 1 from public.fpl_fixtures ff
                   where ff.canonical_fixture_id = fb.fixture_id and ff.kickoff_time is not null
                     and not (extract(isodow from (ff.kickoff_time at time zone 'Europe/London')) = 6
                              and (ff.kickoff_time at time zone 'Europe/London')::time between time '14:45' and time '17:15'))
        or not exists (
          select 1 from public.fixtures f join public.leagues l on l.league_id = f.league_id
          where f.fixture_id = fb.fixture_id
            and l.code in ('E0','E1','E2','E3','EC')
            and f.status <> 'postponed'
            and extract(isodow from f.kickoff_date) = 6
            and f.kickoff_time between time '14:45' and time '17:15'))
    returning 1)
  select count(*) into n_del from gone;

  with added as (
    insert into public.fixture_broadcasts (fixture_id, market, status, source, verified_at, availability_notes, confidence)
    select f.fixture_id, 'GB', 'confirmed_not_televised', 'rule:3pm_blackout', now(),
           'Saturday 3pm kick-offs are not shown live in the UK.', 'probable'
    from public.fixtures f
    join public.leagues l on l.league_id = f.league_id
    where l.code in ('E0','E1','E2','E3','EC')
      and f.status = 'scheduled'
      and f.kickoff_date >= current_date
      and extract(isodow from f.kickoff_date) = 6
      and f.kickoff_time between time '14:45' and time '17:15'
      -- DQ-01: a genuine Saturday 3pm kick-off by FPL's feed too, where it has one.
      and not exists (select 1 from public.fpl_fixtures ff
                      where ff.canonical_fixture_id = f.fixture_id and ff.kickoff_time is not null
                        and not (extract(isodow from (ff.kickoff_time at time zone 'Europe/London')) = 6
                                 and (ff.kickoff_time at time zone 'Europe/London')::time between time '14:45' and time '17:15'))
      and not exists (select 1 from public.fixture_broadcasts fb where fb.fixture_id = f.fixture_id and fb.market = 'GB')
    returning 1)
  select count(*) into n_ins from added;

  return jsonb_build_object('removed', n_del, 'added', n_ins);
end;
$function$
;
