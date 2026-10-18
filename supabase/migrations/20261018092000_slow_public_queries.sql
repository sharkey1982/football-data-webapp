-- ============================================================================
-- Three slow public queries (18 Oct 2026), found by the first browser smoke
-- run and pg_stat_statements. Public (anon) calls are cut off at 3 s.
--
-- 1. get_matchweek_head_to_head (Fixtures page): 7.2 s for a season, so the
--    page's head-to-head column failed with HTTP 500 (statement timeout) for
--    every visitor. matches had no index on the two teams, and the join
--    "(home = a and away = b) or (home = b and away = a)" cannot use one
--    anyway. Now: index matches (home_team_id, away_team_id) and the two
--    directions as UNION ALL (identical rows; a match cannot be both, as
--    home <> away).
-- 2. get_tactical_role_worklist (/fpl/line-ups): 1.9 s, also timing out
--    under load (500); it read the latest ownership for every player in
--    fpl_player_snapshots (56 MB of wide rows) to keep ~320. Now one index
--    lookup per listed player: 22 ms.
-- 3. get_model_accuracy (Football hub, model accuracy): ~0.9 s warm, 2.8 s
--    seen live, recomputing the Dixon-Coles market probabilities of every
--    played fixture. fixture_derived_markets is IMMUTABLE (same inputs, same
--    output), so its results are memoised in derived_markets_memo, keyed by
--    the exact inputs; a missing entry is computed on the fly, so the result
--    can never differ. pg_cron fills new entries every 15 minutes.
-- Each rewrite is compared row for row with the old definition below.
-- ============================================================================

create index if not exists matches_teams_idx on public.matches (home_team_id, away_team_id)
  include (full_time_result, match_date, full_time_home_goals, full_time_away_goals);

-- Keep the old definitions for the comparison (dropped at the end).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.get_matchweek_head_to_head(bigint, bigint, integer)'::regprocedure);
  execute replace(d, 'public.get_matchweek_head_to_head(', 'public.zz_old_matchweek_h2h(');
  d := pg_get_functiondef('public.get_tactical_role_worklist(bigint)'::regprocedure);
  execute replace(d, 'public.get_tactical_role_worklist(', 'public.zz_old_worklist(');
  d := pg_get_functiondef('public.get_model_accuracy(bigint)'::regprocedure);
  execute replace(d, 'public.get_model_accuracy(', 'public.zz_old_model_accuracy(');
end $$;

-- 1 ------------------------------------------------------------------------
do $$
declare d text;
  a text := '    from fx
    join public.matches m
      on (m.home_team_id = fx.fx_home and m.away_team_id = fx.fx_away)
      or (m.home_team_id = fx.fx_away and m.away_team_id = fx.fx_home)
    where m.full_time_result is not null
  ),';
begin
  d := pg_get_functiondef('public.get_matchweek_head_to_head(bigint, bigint, integer)'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'h2h anchor not found exactly once'; end if;
  execute replace(d, a, '    from fx
    join public.matches m on m.home_team_id = fx.fx_home and m.away_team_id = fx.fx_away
    where m.full_time_result is not null
    union all
    select fx.fixture_id, fx.fx_home, fx.fx_away,
      m.home_team_id, m.full_time_result,
      m.match_date, m.full_time_home_goals, m.full_time_away_goals
    from fx
    join public.matches m on m.home_team_id = fx.fx_away and m.away_team_id = fx.fx_home
    where m.full_time_result is not null
  ),');
end $$;

-- 2 ------------------------------------------------------------------------
do $$
declare d text;
  a1 text := '  with mins as (
    select g.fpl_player_id, sum(g.minutes)::integer as m, sum(g.total_points)::integer as pts
    from public.fpl_player_gameweeks g
    where g.season_id = p_season_id
    group by g.fpl_player_id
  ),
  latest_snap as (
    select distinct on (s.fpl_player_id) s.fpl_player_id, s.selected_by_percent
    from public.fpl_player_snapshots s
    where s.season_id = p_season_id
    order by s.fpl_player_id, s.snapshot_date desc
  )
  select';
  a2 text := '  left join mins m on m.fpl_player_id = d.fpl_player_id
  left join latest_snap ls on ls.fpl_player_id = d.fpl_player_id';
begin
  d := pg_get_functiondef('public.get_tactical_role_worklist(bigint)'::regprocedure);
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'worklist anchors not found'; end if;
  d := replace(d, a1, '  select');
  d := replace(d, a2, '  -- 2026-10-18: per listed player, by index (was every player of the season).
  left join lateral (select sum(g.minutes)::integer as m, sum(g.total_points)::integer as pts
                     from public.fpl_player_gameweeks g
                     where g.season_id = d.season_id and g.fpl_player_id = d.fpl_player_id) m on true
  left join lateral (select s.selected_by_percent from public.fpl_player_snapshots s
                     where s.season_id = d.season_id and s.fpl_player_id = d.fpl_player_id
                     order by s.snapshot_date desc limit 1) ls on true');
  execute d;
end $$;

-- 3 ------------------------------------------------------------------------
create table if not exists public.derived_markets_memo (
  lambda_home numeric not null,
  lambda_away numeric not null,
  rho numeric not null,
  home_win numeric, draw numeric, away_win numeric, over_2_5 numeric, under_2_5 numeric,
  btts numeric, home_clean_sheet numeric, away_clean_sheet numeric,
  primary key (lambda_home, lambda_away, rho)
);
alter table public.derived_markets_memo enable row level security;
drop policy if exists derived_markets_memo_read on public.derived_markets_memo;
create policy derived_markets_memo_read on public.derived_markets_memo for select using (true);
grant select on public.derived_markets_memo to anon, authenticated, service_role;
comment on table public.derived_markets_memo is
  'Results of the IMMUTABLE fixture_derived_markets(lambda_home, lambda_away, rho), keyed by its exact inputs. fixture_derived_markets_cached reads it and computes anything missing; refresh_derived_markets_memo fills it.';

create or replace function public.fixture_derived_markets_cached(p_lambda_home numeric, p_lambda_away numeric, p_rho numeric)
returns table(home_win numeric, draw numeric, away_win numeric, over_2_5 numeric, under_2_5 numeric, btts numeric, home_clean_sheet numeric, away_clean_sheet numeric)
language sql stable set search_path = '' as $$
  (select m.home_win, m.draw, m.away_win, m.over_2_5, m.under_2_5, m.btts, m.home_clean_sheet, m.away_clean_sheet
     from public.derived_markets_memo m
    where m.lambda_home = p_lambda_home and m.lambda_away = p_lambda_away and m.rho = p_rho
   union all
   select * from public.fixture_derived_markets(p_lambda_home, p_lambda_away, p_rho))
  limit 1
$$;
grant execute on function public.fixture_derived_markets_cached(numeric, numeric, numeric) to anon, authenticated, service_role;

create or replace function public.refresh_derived_markets_memo()
returns integer language sql security definer set search_path = '' as $$
  with ins as (
    insert into public.derived_markets_memo
    select x.lh, x.la, x.rho, dm.*
    from (select distinct f.predicted_home_goals::numeric lh, f.predicted_away_goals::numeric la, r.rho::numeric rho
            from public.fixtures f join public.model_fit_runs r on r.fit_run_id = f.prediction_fit_run_id
           where f.predicted_home_goals is not null and f.predicted_away_goals is not null and r.rho is not null) x
    cross join lateral public.fixture_derived_markets(x.lh, x.la, x.rho) dm
    where not exists (select 1 from public.derived_markets_memo m where m.lambda_home = x.lh and m.lambda_away = x.la and m.rho = x.rho)
    on conflict do nothing
    returning 1)
  select count(*)::integer from ins
$$;
revoke all on function public.refresh_derived_markets_memo() from public, anon, authenticated;
grant execute on function public.refresh_derived_markets_memo() to service_role;
select public.refresh_derived_markets_memo();

do $$
declare d text; a text := 'cross join lateral public.fixture_derived_markets(';
begin
  d := pg_get_functiondef('public.get_model_accuracy(bigint)'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'model accuracy anchor not found exactly once'; end if;
  execute replace(d, a, 'cross join lateral public.fixture_derived_markets_cached(');
end $$;

select cron.unschedule('refresh-derived-markets-memo') where exists (select 1 from cron.job where jobname = 'refresh-derived-markets-memo');
select cron.schedule('refresh-derived-markets-memo', '7,22,37,52 * * * *', $$select public.refresh_derived_markets_memo()$$);
insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, notes) values
  ('refresh-derived-markets-memo', 'football', 'supabase_cron', '7,22,37,52 * * * *', '1 hour', '10 minutes', 'pg_cron', '^refresh-derived-markets-memo$',
   'Memoises fixture_derived_markets for current predictions (speed only: a missing entry is computed on the fly)')
on conflict (job_key) do nothing;

-- Compare new with old, row for row.
do $$
declare n bigint; r record;
begin
  for r in select * from (values (1::bigint, 13::bigint, null::int), (1, 13, 8), (3, 13, 12), (2, 13, 15), (13, 13, 9), (9, 13, 3)) v(l, s, mw) loop
    select count(*) into n from (
      (select * from public.get_matchweek_head_to_head(r.l, r.s, r.mw) except all select * from public.zz_old_matchweek_h2h(r.l, r.s, r.mw))
      union all
      (select * from public.zz_old_matchweek_h2h(r.l, r.s, r.mw) except all select * from public.get_matchweek_head_to_head(r.l, r.s, r.mw))) x;
    if n <> 0 then raise exception 'head-to-head differs for league % season % matchweek %: % rows', r.l, r.s, r.mw, n; end if;
  end loop;

  select count(*) into n from (
    (select * from public.get_tactical_role_worklist(13) except all select * from public.zz_old_worklist(13))
    union all
    (select * from public.zz_old_worklist(13) except all select * from public.get_tactical_role_worklist(13))) x;
  if n <> 0 then raise exception 'worklist differs: % rows', n; end if;

  select count(*) into n from (
    (select * from public.get_model_accuracy(null) except all select * from public.zz_old_model_accuracy(null))
    union all
    (select * from public.zz_old_model_accuracy(null) except all select * from public.get_model_accuracy(null))) x;
  if n <> 0 then raise exception 'model accuracy differs: % rows', n; end if;

  -- a memo miss still gives the right answer
  select count(*) into n from (
    select * from public.fixture_derived_markets_cached(1.2345678, 0.9876543, -0.05)
    except all select * from public.fixture_derived_markets(1.2345678, 0.9876543, -0.05)) x;
  if n <> 0 then raise exception 'cached markets differ on a miss'; end if;
end $$;

drop function public.zz_old_matchweek_h2h(bigint, bigint, integer);
drop function public.zz_old_worklist(bigint);
drop function public.zz_old_model_accuracy(bigint);
