-- DQ-02 + DQ-03 (audit 22 Oct 2026): an honest fixture status.
--
-- Before: refresh_fixture_feeds / refresh_feed_nearest_date set
-- status='played' as soon as kick-off passed, with or without a score, and
-- reconcile_unreported_played_fixtures() then relabelled any such game with no
-- result after 3 days as 'postponed' -- an inference no source made (8 League
-- One games, 1 League Two, 1 La Liga).
--
-- Now:
--  * new status 'awaiting_result': kicked off, no result or reported score yet.
--  * 'played' only with a result in matches (same pairing, within 3 days) or a
--    reported score. Enforced by a BEFORE trigger on fixtures, so every writer
--    (feeds, cup ingest, National League scraper) gets it; a statement trigger
--    on matches moves awaiting fixtures to 'played' the moment a result lands.
--  * 'postponed' only from a source that says so (National League scraper,
--    feed date moves). reconcile_unreported_played_fixtures() no longer
--    infers it; it now only sweeps the two statuses into line.
--  * the 10 inferred postponements become awaiting_result (Scunthorpe v
--    Forest Green, 6186, stays postponed: the National League source set it
--    on 26 Sep, before kick-off).
--  * consumers that read "not 'played'" as "upcoming" now exclude
--    awaiting_result too; check_model_integrity gains results_missing_48h.
-- Safe to re-run.

-- ---------------------------------------------------------------- status values
alter table public.fixtures drop constraint if exists fixtures_status_check;
alter table public.fixtures add constraint fixtures_status_check
  check (status = any (array['scheduled'::text, 'postponed'::text, 'played'::text, 'awaiting_result'::text]));
comment on column public.fixtures.status is
  'scheduled | postponed (a source said so) | awaiting_result (kicked off, no result or reported score yet) | played (result in matches or a reported score). Kept honest by trigger fixtures_status_honest.';

create index if not exists fixtures_awaiting_result_idx on public.fixtures (league_id, season_id, home_team_id, away_team_id)
  where status = 'awaiting_result';

-- ---------------------------------------------------------------- fixtures trigger
create or replace function private.fixture_has_result(p_league bigint, p_season bigint, p_home bigint, p_away bigint, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.matches m
                 where m.league_id = p_league and m.season_id = p_season
                   and m.home_team_id = p_home and m.away_team_id = p_away
                   and m.match_date between p_date - 3 and p_date + 3
                   and m.full_time_home_goals is not null)
$$;

create or replace function private.fixtures_status_honest()
returns trigger
language plpgsql
security definer  -- writers (e.g. the cup Edge Function) need no access to private
set search_path = ''
as $$
begin
  if new.status = 'played' and new.reported_home_goals is null
     and not private.fixture_has_result(new.league_id, new.season_id, new.home_team_id, new.away_team_id, new.kickoff_date) then
    new.status := 'awaiting_result';
  elsif new.status = 'awaiting_result'
     and (new.reported_home_goals is not null
          or private.fixture_has_result(new.league_id, new.season_id, new.home_team_id, new.away_team_id, new.kickoff_date)) then
    new.status := 'played';
  end if;
  return new;
end;
$$;

drop trigger if exists fixtures_status_honest on public.fixtures;
create trigger fixtures_status_honest
  before insert or update of status, reported_home_goals, kickoff_date on public.fixtures
  for each row
  when (new.status in ('played', 'awaiting_result'))
  execute function private.fixtures_status_honest();

-- ---------------------------------------------------------------- matches trigger
create or replace function private.matches_mark_fixtures_played()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fixtures f set status = 'played', updated_at = now()
    from new_rows m
   where f.status = 'awaiting_result'
     and m.league_id = f.league_id and m.season_id = f.season_id
     and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
     and m.match_date between f.kickoff_date - 3 and f.kickoff_date + 3
     and m.full_time_home_goals is not null;
  return null;
end;
$$;

drop trigger if exists matches_mark_fixtures_played_ins on public.matches;
create trigger matches_mark_fixtures_played_ins
  after insert on public.matches
  referencing new table as new_rows
  for each statement execute function private.matches_mark_fixtures_played();
drop trigger if exists matches_mark_fixtures_played_upd on public.matches;
create trigger matches_mark_fixtures_played_upd
  after update on public.matches
  referencing new table as new_rows
  for each statement execute function private.matches_mark_fixtures_played();

-- ---------------------------------------------------------------- no more inferred postponements
create or replace function public.reconcile_unreported_played_fixtures()
returns integer
language sql
security definer
set search_path = ''
as $$
  -- 2026-10-22 (DQ-03): never infers 'postponed' any more. Sweeps statuses
  -- into line (the fixtures trigger does this on every write; this catches
  -- rows no write has touched): kicked-off games without a result are
  -- awaiting_result, games with one are played.
  with a as (
    update public.fixtures f set status = 'awaiting_result', updated_at = now()
     where f.status = 'played' and f.reported_home_goals is null
       and not private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date)
    returning 1),
  b as (
    update public.fixtures f set status = 'played', updated_at = now()
     where f.status = 'awaiting_result'
       and (f.reported_home_goals is not null
            or private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date))
    returning 1)
  select ((select count(*) from a) + (select count(*) from b))::integer
$$;
comment on function public.reconcile_unreported_played_fixtures() is
  'Sweeps fixtures.status into line: played without a result -> awaiting_result, awaiting_result with one -> played. Never sets postponed (DQ-03, 22 Oct 2026). Called by refresh_fixture_feeds.';

create or replace function public.sync_fixture_status_from_results()
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  with upd as (
    update public.fixtures f set status = 'played', updated_at = now()
    where f.status in ('scheduled', 'postponed', 'awaiting_result')
      and f.kickoff_date < current_date
      and exists (select 1 from public.matches m
                  where m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
                    and m.match_date::date = f.kickoff_date and m.full_time_home_goals is not null)
    returning 1)
  select count(*)::integer from upd;
$function$;

-- National League scraper: keep an awaiting_result game kicked off (the
-- trigger then decides played vs awaiting_result), rather than sending it
-- back to 'scheduled'.
do $mig$
declare
  d text := pg_get_functiondef('public.refresh_national_league_fixtures()'::regprocedure);
  a text := $a$when e.hg is not null or f.status = 'played' then 'played'$a$;
  b text := $b$when e.hg is not null or f.status in ('played', 'awaiting_result') then 'played'$b$;
begin
  if position(b in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 2 then raise exception 'refresh_national_league_fixtures anchor not found exactly twice'; end if;
  execute replace(d, a, b);
end;
$mig$;

-- ---------------------------------------------------------------- consumers: "not played" meant "upcoming"
do $mig$
declare
  d text := pg_get_functiondef('public.get_fpl_minutes_outlook(bigint)'::regprocedure);
  a text := $a$     and f.status <> 'played'$a$;
  b text := $b$     and f.status not in ('played', 'awaiting_result')$b$;
begin
  if position(b in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'get_fpl_minutes_outlook anchor not found exactly once'; end if;
  execute replace(d, a, b);
end;
$mig$;

-- refresh_fpl_projection_fixture_v6 needs no change: since 20261022110000 it
-- freezes a fixture once v_kickoff <= now(), which covers awaiting_result.

do $mig$
declare
  d text := pg_get_viewdef('public.fpl_player_fixture_availability'::regclass);
  a text := $a$(f.status <> 'played'::text)$a$;
  b text := $b$(f.status <> ALL (ARRAY['played'::text, 'awaiting_result'::text]))$b$;
begin
  if position('awaiting_result' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'fpl_player_fixture_availability anchor not found exactly once'; end if;
  -- security_invoker as before (create or replace resets unspecified options).
  execute 'create or replace view public.fpl_player_fixture_availability with (security_invoker = true) as ' || replace(d, a, b);
end;
$mig$;

-- ---------------------------------------------------------------- integrity checks
do $mig$
declare
  d text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  -- kicked-off fixtures without a result must also carry a pre-kick-off prediction
  a1 text := $a$        where f.season_id = (select s from cur) and f.status = 'played'
          and (r.status <> 'accepted' or r.fitted_at::date >= f.kickoff_date)) x$a$;
  b1 text := $b$        where f.season_id = (select s from cur) and f.status in ('played', 'awaiting_result')
          and (r.status <> 'accepted' or r.fitted_at::date >= f.kickoff_date)) x$b$;
  a2 text := $a$  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$a$;
  b2 text := $b$  -- DQ-02 (2026-10-22): a kicked-off game whose result has not arrived in
  -- 48 hours needs a look (results feed lag, mapping gap, or a real
  -- postponement no source has reported).
  select 'results_missing_48h', case when n = 0 then 'ok' else 'warning' end, n,
    'Fixtures awaiting a result more than 48 hours after kick-off: ' || coalesce(ids, 'none')
  from (select count(*) n,
               string_agg(f.fixture_id || ' ' || l.code || ' ' || ht.canonical_name || ' v ' || at.canonical_name || ' ' || f.kickoff_date,
                          ', ' order by f.kickoff_date, f.fixture_id) ids
        from public.fixtures f
        join public.leagues l on l.league_id = f.league_id
        join public.teams ht on ht.team_id = f.home_team_id
        join public.teams at on at.team_id = f.away_team_id
        where f.status = 'awaiting_result'
          and (f.kickoff_date + coalesce(f.kickoff_time, time '12:00')) < (now() at time zone 'Europe/London') - interval '48 hours') x
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$b$;
begin
  if position('results_missing_48h' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception 'check_model_integrity anchor a1 not found exactly once'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'check_model_integrity anchor a2 not found exactly once'; end if;
  execute replace(replace(d, a1, b1), a2, b2);
end;
$mig$;

-- ---------------------------------------------------------------- correct the rows now
-- The 10 postponements reconcile_unreported_played_fixtures() inferred
-- (audit DQ-03; each last touched by the 21 Oct 04:15 feed run, no source
-- reports a postponement): back to kicked-off, awaiting a result.
update public.fixtures set status = 'awaiting_result', updated_at = now()
 where fixture_id in (1393, 1484, 1158, 1326, 1368, 1123, 1384, 1314, 1599, 4536)
   and status = 'postponed';
-- The 33 'played' games of 20 Oct with no score, and any others.
select public.reconcile_unreported_played_fixtures();

-- Catalogue: the refresh_fixture_feeds caveat no longer holds.
update public.meta_flow_nodes
   set purpose = replace(purpose,
         'Caveats: fixture status becomes ''played'' purely because kick-off time has passed, not because a result exists (check_model_integrity ''played_without_result'' catches a missing result);',
         'A kicked-off fixture is ''awaiting_result'' until a result or reported score exists, then ''played'' (trigger fixtures_status_honest; check_model_integrity ''results_missing_48h''). Caveats:')
 where purpose like '%Caveats: fixture status becomes ''played'' purely because kick-off time has passed%';
