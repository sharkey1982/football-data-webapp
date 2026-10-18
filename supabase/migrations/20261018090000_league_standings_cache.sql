-- ============================================================================
-- League tables from a cache (18 Oct 2026).
--
-- public.league_standings computed all 7,309 team-seasons (every domestic
-- league, every season, split formats, deductions, head-to-head tiebreaks)
-- on every request and only then filtered: about 1.1 s whatever was asked
-- for. pg_stat_statements since the last reset: 731 public calls averaging
-- 845 ms (a team's seasons), 129 at 750 ms (one table), 60 at 1.76 s, close
-- to the 3 s anon statement limit.
--
-- Now:
-- * public.league_standings_live: the original definition, unchanged.
-- * public.league_standings_cache: its rows, indexed by team, league-season
--   and league code.
-- * public.league_standings: the same columns, read from the cache, so
--   every caller (pages, team_season_summary, the static build) is
--   unchanged and gets milliseconds instead of a second.
-- * public.refresh_league_standings_cache(): rebuilds the cache when its
--   inputs change. A fingerprint of matches (count, latest update and a hash
--   of every column the table uses; ~0.1 s) and the small reference tables
--   (deductions, formats, leagues, seasons, team names) decides; pg_cron runs
--   it every 5 minutes, so a new result reaches the tables within 5 minutes.
--   A rebuild logs pipeline_runs (league_standings_cache); an unchanged check
--   logs nothing.
-- * Integrity check league_standings_cache_current: the cache must equal the
--   live view (both directions); warning, since a result loaded in the last
--   5 minutes is legitimately not in it yet.
-- ============================================================================

do $$
begin
  if to_regclass('public.league_standings_live') is null then
    execute 'create view public.league_standings_live as ' || pg_get_viewdef('public.league_standings'::regclass);
  end if;
end $$;
revoke all on public.league_standings_live from anon, authenticated;
grant select on public.league_standings_live to service_role;
comment on view public.league_standings_live is
  'League tables computed from matches (the original league_standings definition). Slow (~1 s): read public.league_standings, which serves the cached rows.';

create table if not exists public.league_standings_cache as select * from public.league_standings_live with no data;
alter table public.league_standings_cache enable row level security;
drop policy if exists league_standings_cache_read on public.league_standings_cache;
create policy league_standings_cache_read on public.league_standings_cache for select using (true);
grant select on public.league_standings_cache to anon, authenticated, service_role;
create index if not exists league_standings_cache_team_idx on public.league_standings_cache (team_id, season_start_year);
create index if not exists league_standings_cache_league_season_idx on public.league_standings_cache (league_id, season_id, position);
create index if not exists league_standings_cache_code_idx on public.league_standings_cache (league_code, season_start_year);

create table if not exists public.league_standings_cache_state (
  id int primary key default 1 check (id = 1),
  fingerprint text,
  refreshed_at timestamptz,
  rows_cached int,
  duration_ms int
);
alter table public.league_standings_cache_state enable row level security;
revoke all on public.league_standings_cache_state from anon, authenticated;
grant select on public.league_standings_cache_state to service_role;
insert into public.league_standings_cache_state (id) values (1) on conflict (id) do nothing;

create or replace function public.league_standings_fingerprint()
returns text language sql stable set search_path = '' as $$
  select md5(concat_ws('|',
    (select count(*) || ':' || coalesce(max(m.updated_at)::text, '') || ':' ||
            coalesce(sum(hashint8(m.match_id) # hashint8(m.home_team_id * 1000003 + m.away_team_id)
                # hashint4(coalesce(m.full_time_home_goals, -1) * 101 + coalesce(m.full_time_away_goals, -1))
                # hashint4((m.match_date - date '1900-01-01')::int)
                # hashint8(m.league_id * 10007 + m.season_id)
                # hashint8(coalesce(extract(epoch from m.kickoff_time)::bigint, -1))
                # hashtext(coalesce(m.stage, '') || '/' || coalesce(m.decided_by, '') || '/' || coalesce(m.winner_team_id::text, '')))::text, '')
       from public.matches m),
    (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from public.point_deductions x),
    (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from public.league_season_formats x),
    (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from public.leagues x),
    (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from public.seasons x),
    (select md5(coalesce(string_agg(t.team_id || ':' || t.canonical_name, ',' order by t.team_id), '')) from public.teams t)))
$$;

create or replace function public.refresh_league_standings_cache(p_force boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.refresh_league_standings_cache(boolean) from public, anon, authenticated;
grant execute on function public.refresh_league_standings_cache(boolean) to service_role;

select public.refresh_league_standings_cache(true);

-- Same columns, same order, same types: dependants (team_season_summary) and
-- every client are unaffected.
create or replace view public.league_standings as select * from public.league_standings_cache;
grant select on public.league_standings to anon, authenticated, service_role;
comment on view public.league_standings is
  'League tables, served from league_standings_cache (refreshed within 5 minutes of a change by refresh_league_standings_cache). The computation is league_standings_live.';

select cron.unschedule('refresh-league-standings-cache') where exists (select 1 from cron.job where jobname = 'refresh-league-standings-cache');
select cron.schedule('refresh-league-standings-cache', '*/5 * * * *', $$select public.refresh_league_standings_cache()$$);

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, output_check, notes) values
  ('refresh-league-standings-cache', 'football', 'supabase_cron', '*/5 * * * *', '15 minutes', '5 minutes', 'pg_cron', '^refresh-league-standings-cache$', null, 'league_standings_cache_current', 'Checks a fingerprint every 5 minutes; rebuilds only when matches or reference tables changed'),
  ('league_standings_cache', 'football', 'supabase_cron', 'when inputs change', null, '5 minutes', 'pipeline_runs', '^league_standings_cache$', null, 'league_standings_cache_current', 'One row per rebuild')
on conflict (job_key) do nothing;

do $$
declare d text; a text := '  union all
  -- Catalogue (2026-09-26)';
begin
  d := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  if position(a in d) = 0 then raise exception 'catalogue anchor not found'; end if;
  d := replace(d, a, '  union all
  -- League tables cache (2026-10-18): the served rows must equal the computation.
  select ''league_standings_cache_current'', case when n = 0 then ''ok'' else ''warning'' end, n,
    ''Team-season rows that differ between league_standings (cache) and league_standings_live; refresh_league_standings_cache() runs every 5 minutes''
  from (select (select count(*) from (select * from public.league_standings_cache except select * from public.league_standings_live) a)
             + (select count(*) from (select * from public.league_standings_live except select * from public.league_standings_cache) b) n) x
' || a);
  execute d;
end $$;

-- Checks: identical rows, and the cache follows a change.
do $$
declare n bigint; before int;
begin
  select count(*) into n from (select * from public.league_standings except select * from public.league_standings_live) a;
  if n <> 0 then raise exception 'cache differs from the live view (% rows)', n; end if;
  select count(*) into n from (select * from public.league_standings_live except select * from public.league_standings) a;
  if n <> 0 then raise exception 'live view has % rows missing from the cache', n; end if;
  if public.refresh_league_standings_cache() <> 'up to date' then raise exception 'second refresh should be a no-op'; end if;
  begin
    select points into before from public.league_standings where league_id = 1 and season_id = 13 order by position limit 1;
    update public.matches set full_time_home_goals = full_time_home_goals + 10
     where match_id = (select match_id from public.matches where league_id = 1 and season_id = 13 and full_time_home_goals is not null order by match_id limit 1);
    if public.refresh_league_standings_cache() = 'up to date' then raise exception 'a changed result was not detected'; end if;
    select count(*) into n from (select * from public.league_standings except select * from public.league_standings_live) a;
    if n <> 0 then raise exception 'cache did not follow a changed result'; end if;
    raise exception using errcode = 'P0001', message = 'rollback-test';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback-test' then raise; end if;
  end;
end $$;
