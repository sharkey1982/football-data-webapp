-- DQ-01 (audit 22 Oct 2026): Premier League fixtures moved for TV kept
-- FixtureDownload's stale date/time in public.fixtures, while FPL's official
-- feed (fpl_fixtures.kickoff_time, linked by canonical_fixture_id) had the
-- real one. apply_uk_3pm_blackout() then marked the stale Saturday-15:00 slot
-- "confirmed_not_televised" (13 games, incl. Tottenham v Arsenal).
--
-- Fix:
--  1. public.sync_pl_kickoffs_from_fpl(): FPL's kick-off wins for every
--     fixture FPL maps (kickoff date + time, UK local), logged in
--     fixture_changes. Runs from a trigger on fpl_fixtures (so every
--     refresh_fpl run applies FPL moves at once) and from refresh_fixture_feeds.
--  2. refresh_fixture_feeds() no longer moves FPL-mapped fixtures back to
--     FixtureDownload's date (and matches reported scores within 7 days of
--     the feed date rather than on the exact date).
--  3. apply_uk_3pm_blackout(): an FPL kick-off outside Saturday 14:45-17:15
--     (UK) never gets, and loses, a rule row; postponed fixtures lose theirs.
--  4. Integrity check pl_kickoff_matches_fpl.
-- Slugs are unchanged (stable by design; generated on insert only).
-- Safe to re-run.

-- ---------------------------------------------------------------- 1. sync
create or replace function public.sync_pl_kickoffs_from_fpl(p_fixture_id bigint default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
$$;
comment on function public.sync_pl_kickoffs_from_fpl(bigint) is
  'Premier League kick-off date/time follow FPL''s fpl_fixtures.kickoff_time (UK local) for every FPL-mapped fixture; changes logged in fixture_changes. Called by trigger on fpl_fixtures and by refresh_fixture_feeds (DQ-01, 22 Oct 2026).';
revoke all on function public.sync_pl_kickoffs_from_fpl(bigint) from public, anon, authenticated;

create or replace function private.fpl_fixture_sync_canonical_kickoff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Never let this break refresh_fpl: a failure is a warning, and the daily
  -- refresh_fixture_feeds pass plus integrity check pl_kickoff_matches_fpl
  -- catch anything missed.
  begin
    perform public.sync_pl_kickoffs_from_fpl(new.canonical_fixture_id);
  exception when others then
    raise warning 'sync_pl_kickoffs_from_fpl(%) failed: %', new.canonical_fixture_id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists fpl_fixtures_sync_canonical_kickoff on public.fpl_fixtures;
create trigger fpl_fixtures_sync_canonical_kickoff
  after insert or update of kickoff_time, canonical_fixture_id on public.fpl_fixtures
  for each row
  when (new.canonical_fixture_id is not null and new.kickoff_time is not null)
  execute function private.fpl_fixture_sync_canonical_kickoff();

-- ---------------------------------------------------------------- 2. refresh_fixture_feeds
do $mig$
declare
  d text := pg_get_functiondef('public.refresh_fixture_feeds()'::regprocedure);
  -- (a) don't log a FixtureDownload date change for an FPL-mapped fixture
  a1 text := $a$    where m.ko is not null and m.home_id is not null and m.away_id is not null
      and (f.kickoff_date <> (m.ko at time zone 'Europe/London')::date$a$;
  b1 text := $b$    where m.ko is not null and m.home_id is not null and m.away_id is not null
      and not exists (select 1 from public.fpl_fixtures ff where ff.canonical_fixture_id = f.fixture_id and ff.kickoff_time is not null) -- DQ-01: FPL's kick-off wins
      and (f.kickoff_date <> (m.ko at time zone 'Europe/London')::date$b$;
  -- (b) don't move an FPL-mapped fixture back to FixtureDownload's date
  a2 text := $a$f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id;
  get diagnostics v_count=row_count;$a$;
  b2 text := $b$f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id
    and not exists (select 1 from public.fpl_fixtures ff where ff.canonical_fixture_id = f.fixture_id and ff.kickoff_time is not null); -- DQ-01
  get diagnostics v_count=row_count;$b$;
  -- (c) reported score: the feed's date may lag a TV move by days
  a3 text := $a$    and f.kickoff_date = (m.ko at time zone 'Europe/London')::date
    and (f.reported_home_goals is distinct from m.hg$a$;
  b3 text := $b$    and abs(f.kickoff_date - (m.ko at time zone 'Europe/London')::date) <= 7
    and (f.reported_home_goals is distinct from m.hg$b$;
  -- (d) apply FPL's kick-offs on every run
  a4 text := $a$ perform public.reconcile_unreported_played_fixtures();$a$;
  b4 text := $b$ perform public.sync_pl_kickoffs_from_fpl(); -- DQ-01 (2026-10-22): FPL kick-offs win for the PL
 perform public.reconcile_unreported_played_fixtures();$b$;
begin
  if position('sync_pl_kickoffs_from_fpl' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception 'refresh_fixture_feeds anchor a1 not found exactly once'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'refresh_fixture_feeds anchor a2 not found exactly once'; end if;
  if (length(d) - length(replace(d, a3, ''))) / length(a3) <> 1 then raise exception 'refresh_fixture_feeds anchor a3 not found exactly once'; end if;
  if (length(d) - length(replace(d, a4, ''))) / length(a4) <> 1 then raise exception 'refresh_fixture_feeds anchor a4 not found exactly once'; end if;
  execute replace(replace(replace(replace(d, a1, b1), a2, b2), a3, b3), a4, b4);
end;
$mig$;

-- ---------------------------------------------------------------- 3. blackout
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
$function$;

-- ---------------------------------------------------------------- 4. integrity check
do $mig$
declare
  d text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  a text := $a$  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$a$;
  b text := $b$  -- DQ-01 (2026-10-22): Premier League kick-offs must equal FPL's official feed.
  select 'pl_kickoff_matches_fpl', case when n = 0 then 'ok' else 'failed' end, n,
    'Fixtures whose kick-off date/time differs from FPL''s fpl_fixtures.kickoff_time (sync_pl_kickoffs_from_fpl): ' || coalesce(ids, 'none')
  from (select count(*) n, string_agg(f.slug, ', ' order by f.kickoff_date, f.fixture_id) ids
        from public.fpl_fixtures ff join public.fixtures f on f.fixture_id = ff.canonical_fixture_id and f.season_id = ff.season_id
        where ff.kickoff_time is not null
          and ((ff.kickoff_time at time zone 'Europe/London')::date <> f.kickoff_date
               or (ff.kickoff_time at time zone 'Europe/London')::time is distinct from f.kickoff_time)) x
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$b$;
begin
  if position('pl_kickoff_matches_fpl' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'check_model_integrity anchor not found exactly once'; end if;
  execute replace(d, a, b);
end;
$mig$;

-- ---------------------------------------------------------------- correct the rows now
select public.sync_pl_kickoffs_from_fpl();
select public.apply_uk_3pm_blackout();
