-- UK Watch Guide: Saturday 3pm blackout.
--
-- English league matches kicking off on a Saturday between 14:45 and 17:15
-- (UK time; fixtures.kickoff_time is stored as UK local time) cannot be
-- shown live in the UK, but had no fixture_broadcasts rows, so the site
-- showed them as "not yet confirmed" rather than "not televised"
-- (e.g. four Premier League matchweek-6 games on 10 Oct 2026).
--
-- Scope: E0, E1, E2, E3 and EC (Premier League to National League). The
-- blackout covers all football broadcast in the UK in that window, but the
-- rule is limited to these leagues; cup and non-English fixtures are left to
-- Airtable.
--
-- apply_uk_3pm_blackout() keeps one generated row per qualifying upcoming
-- fixture (source 'rule:3pm_blackout', status confirmed_not_televised,
-- market GB) and only where the fixture has no other GB row. Real listings
-- always win:
--   * any other row for the fixture (Airtable or hand-entered) removes the
--     rule row on the next run;
--   * an Airtable "Confirmed not televised" record adopts the rule row
--     (sync_airtable_broadcasts matches rows with no airtable_record_id), so
--     the one-not-televised-per-fixture index is never hit;
--   * a fixture moved out of the window loses its rule row.
-- It runs at the end of every sync_airtable_broadcasts() call (so an Airtable
-- broadcast replaces the rule row in the same transaction) and daily via
-- pg_cron, so an Airtable outage does not stop it.

create or replace function public.apply_uk_3pm_blackout()
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  n_del int;
  n_ins int;
begin
  -- Rule rows that no longer apply: another row now exists for the
  -- fixture, or the fixture has moved out of the blackout window.
  with gone as (
    delete from public.fixture_broadcasts fb
    where fb.source = 'rule:3pm_blackout' and fb.airtable_record_id is null
      and (
        exists (select 1 from public.fixture_broadcasts o
                where o.fixture_id = fb.fixture_id and o.market = fb.market and o.broadcast_id <> fb.broadcast_id)
        or not exists (
          select 1 from public.fixtures f join public.leagues l on l.league_id = f.league_id
          where f.fixture_id = fb.fixture_id
            and l.code in ('E0','E1','E2','E3','EC')
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
      and not exists (select 1 from public.fixture_broadcasts fb where fb.fixture_id = f.fixture_id and fb.market = 'GB')
    returning 1)
  select count(*) into n_ins from added;

  return jsonb_build_object('removed', n_del, 'added', n_ins);
end;
$function$;

revoke all on function public.apply_uk_3pm_blackout() from public, anon, authenticated;
grant execute on function public.apply_uk_3pm_blackout() to service_role;

-- Run it at the end of every Airtable sync (anchored edit, asserted once).
do $mig$
declare
  v_def text := pg_get_functiondef('public.sync_airtable_broadcasts(jsonb)'::regprocedure);
  v_anchor constant text := E'  insert into public.broadcast_sync_runs (records_seen';
  v_new constant text := E'  -- Saturday 3pm blackout rows, after Airtable so a real listing wins.\n'
    || E'  perform public.apply_uk_3pm_blackout();\n\n'
    || E'  insert into public.broadcast_sync_runs (records_seen';
  v_n int;
begin
  if position('apply_uk_3pm_blackout' in v_def) > 0 then
    raise notice 'sync_airtable_broadcasts already applies the blackout rule';
  else
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then raise exception 'anchor matched % times, expected 1', v_n; end if;
    execute replace(v_def, v_anchor, v_new);
  end if;
end
$mig$;

-- Daily as well, after the 04:15 fixture refresh, independent of Airtable.
select cron.unschedule(jobid) from cron.job where jobname = 'apply-uk-3pm-blackout-daily';
select cron.schedule('apply-uk-3pm-blackout-daily', '25 4 * * *', 'select public.apply_uk_3pm_blackout();');

select public.apply_uk_3pm_blackout();
