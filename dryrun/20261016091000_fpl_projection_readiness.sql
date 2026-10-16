-- ============================================================================
-- FPL projection readiness follows the production model (16 Oct 2026).
--
-- fpl_projection_fixture_readiness counted rows for model_version
-- 'prototype_v3', retired weeks ago, so it reported 320 future Premier
-- League fixtures "missing" while production (leaguewide_v6) covered all 100
-- fixtures of the 10-gameweek horizon (6,670 rows). The model version was
-- also hard-coded in check_model_integrity's horizon check.
--
-- Now:
-- * public.production_models names the production version per component;
--   public.fpl_production_model_version() reads it. Switching model = one
--   row update (in a migration), and every check follows.
-- * The readiness view keeps its columns (projection_rows now counts the
--   production model, baseline scenario) and adds: gameweek, whether the
--   fixture is in the pipeline horizon (the 10 gameweeks from the next
--   deadline, as scripts/get_next_matchweek_range.py), players projected,
--   when, rows from other model versions, and readiness_status:
--     past / outside_horizon / missing / partial / stale / ready
--   partial = a side has fewer than 80% of the players that team usually has
--   projected across the horizon (a dropped player-fixture set); stale = the
--   fixture's rows are more than 36 hours older than the newest run.
-- * New integrity check fpl_projection_readiness: fails on missing/partial
--   fixtures in the horizon, warns on stale.
-- * A rolled-back regression test below proves the view follows a model
--   switch and detects a deliberately removed fixture and team.
-- ============================================================================

create table if not exists public.production_models (
  component text primary key,
  model_version text not null,
  since timestamptz not null default now(),
  notes text
);
alter table public.production_models enable row level security;
drop policy if exists production_models_read on public.production_models;
create policy production_models_read on public.production_models for select using (true);
grant select on public.production_models to anon, authenticated, service_role;
comment on table public.production_models is
  'The model version in production for each component. Monitoring reads this instead of hard-coding a version; change it by migration when a model is promoted.';

insert into public.production_models (component, model_version, notes)
values ('fpl_player_projection', 'leaguewide_v6', 'Promoted Oct 2026; CURRENT_MODEL_VERSION in src/lib/fplApi.ts must match')
on conflict (component) do nothing;

create or replace function public.fpl_production_model_version()
returns text language sql stable set search_path = '' as $$
  select model_version from public.production_models where component = 'fpl_player_projection'
$$;
grant execute on function public.fpl_production_model_version() to anon, authenticated, service_role;

create or replace view public.fpl_projection_fixture_readiness as
with cfg as (
  select public.fpl_current_season_id() as season_id,
         public.fpl_production_model_version() as model_version,
         public.ai_next_fpl_gameweek(public.fpl_current_season_id()) as first_gw
), prod as (
  select p.fixture_id, pl.canonical_team_id as team_id,
         count(*) as n_rows, count(distinct p.fpl_player_id) as n_players, max(p.generated_at) as generated_at
  from public.fpl_player_projections p
  join cfg on cfg.season_id = p.season_id and cfg.model_version = p.model_version
  left join public.fpl_players pl on pl.season_id = p.season_id and pl.fpl_player_id = p.fpl_player_id
  where coalesce(p.scenario_key, 'baseline') = 'baseline'
  group by p.fixture_id, pl.canonical_team_id
), team_norm as (
  -- players a team usually has projected per fixture across the horizon
  select pr.team_id, percentile_cont(0.5) within group (order by pr.n_players) as median_players
  from prod pr
  join public.fpl_fixtures ff on ff.canonical_fixture_id = pr.fixture_id
  join cfg on cfg.season_id = ff.season_id
  where ff.fpl_event_id between cfg.first_gw and cfg.first_gw + 9
  group by pr.team_id
), newest as (
  select max(pr.generated_at) as generated_at from prod pr
), base as (
  select f.fixture_id, f.kickoff_date, f.home_team_id, f.away_team_id,
         f.predicted_home_goals, f.predicted_away_goals,
         cfg.model_version, ff.fpl_event_id,
         coalesce(ff.fpl_event_id between cfg.first_gw and cfg.first_gw + 9, false) as in_horizon,
         coalesce((select sum(pr.n_rows) from prod pr where pr.fixture_id = f.fixture_id), 0)::bigint as projection_rows,
         coalesce((select sum(pr.n_players) from prod pr where pr.fixture_id = f.fixture_id), 0)::bigint as projected_players,
         (select max(pr.generated_at) from prod pr where pr.fixture_id = f.fixture_id) as generated_at,
         exists (select 1 from (values (f.home_team_id), (f.away_team_id)) s(team_id)
                 left join prod pr on pr.fixture_id = f.fixture_id and pr.team_id = s.team_id
                 join team_norm tn on tn.team_id = s.team_id
                 where coalesce(pr.n_players, 0) < 0.8 * tn.median_players) as side_short,
         coalesce((select count(*) from public.fpl_player_projections o
                   where o.fixture_id = f.fixture_id and o.model_version is distinct from cfg.model_version), 0)::bigint as other_model_rows
  from public.fixtures f
  join public.leagues l on l.league_id = f.league_id
  cross join cfg
  left join public.fpl_fixtures ff on ff.season_id = cfg.season_id and ff.canonical_fixture_id = f.fixture_id
  where f.season_id = cfg.season_id and l.code = 'E0'
)
select b.fixture_id,
       b.kickoff_date,
       b.home_team_id,
       b.away_team_id,
       b.predicted_home_goals,
       b.predicted_away_goals,
       b.predicted_home_goals is not null and b.predicted_away_goals is not null as has_team_xg,
       coalesce((select count(*) from public.fixture_lineup_predictions lp where lp.fixture_id = b.fixture_id), 0::bigint) as lineup_sources,
       coalesce((select count(*) from public.fixture_lineup_prediction_players lpp
                 join public.fixture_lineup_predictions lp on lp.lineup_prediction_id = lpp.lineup_prediction_id
                 where lp.fixture_id = b.fixture_id), 0::bigint) as lineup_player_rows,
       b.projection_rows,
       b.model_version as production_model,
       b.fpl_event_id,
       b.in_horizon,
       b.projected_players,
       b.generated_at,
       b.other_model_rows,
       case when b.kickoff_date < current_date and not b.in_horizon then 'past'
            when not b.in_horizon then 'outside_horizon'
            when b.projection_rows = 0 then 'missing'
            when b.side_short then 'partial'
            when b.generated_at < (select generated_at from newest) - interval '36 hours' then 'stale'
            else 'ready' end as readiness_status
from base b;
revoke all on public.fpl_projection_fixture_readiness from anon, authenticated;
grant select on public.fpl_projection_fixture_readiness to service_role;
comment on view public.fpl_projection_fixture_readiness is
  'Per Premier League fixture: is the production FPL projection (production_models) complete and current? readiness_status past/outside_horizon/missing/partial/stale/ready.';

create or replace view public.fpl_projection_data_health as
select fixture_id, kickoff_date, has_team_xg as team_forecast_ready, lineup_sources, lineup_player_rows, projection_rows,
       case when readiness_status = 'ready' then 'ready'
            when readiness_status in ('missing', 'partial', 'stale') and has_team_xg and lineup_sources = 0 then 'awaiting_player_projection'
            when readiness_status in ('past', 'outside_horizon') then readiness_status
            else 'incomplete' end as projection_status,
       readiness_status, production_model, fpl_event_id
from public.fpl_projection_fixture_readiness;
revoke all on public.fpl_projection_data_health from anon, authenticated;
grant select on public.fpl_projection_data_health to service_role;

-- check_model_integrity: production model instead of a literal, plus readiness.
do $$
declare d text; n int;
begin
  d := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  n := (length(d) - length(replace(d, '''leaguewide_v6''', ''))) / length('''leaguewide_v6''');
  if n <> 2 then raise exception 'expected 2 literal leaguewide_v6 in check_model_integrity, found %', n; end if;
  d := replace(d, '''leaguewide_v6''', 'public.fpl_production_model_version()');
  d := replace(d, 'with no leaguewide_v6 baseline projections', 'with no production-model baseline projections');
  if position('  union all
  -- Catalogue (2026-09-26)' in d) = 0 then raise exception 'catalogue anchor not found'; end if;
  d := replace(d, '  union all
  -- Catalogue (2026-09-26)', '  union all
  -- Readiness (2026-10-16): every fixture in the projection horizon has a
  -- complete, current production-model projection (fpl_projection_fixture_readiness).
  select ''fpl_projection_readiness'',
    case when count(*) filter (where readiness_status in (''missing'', ''partial'')) > 0 then ''failed''
         when count(*) filter (where readiness_status = ''stale'') > 0 then ''warning'' else ''ok'' end,
    count(*) filter (where readiness_status in (''missing'', ''partial'', ''stale'')),
    ''Horizon fixtures whose production-model projection is missing, partial or stale: '' ||
      coalesce(string_agg(fixture_id || '' '' || readiness_status, '', '' order by fixture_id)
               filter (where readiness_status in (''missing'', ''partial'', ''stale'')), ''none'') ||
      '' (model '' || coalesce(public.fpl_production_model_version(), ''NOT SET'') || '')''
  from public.fpl_projection_fixture_readiness where in_horizon
  union all
  -- Catalogue (2026-09-26)');
  execute d;
end $$;

-- Regression test (rolled back): model switch, a removed fixture, a removed team.
do $$
declare n_h int; n_ready int; fx bigint; tm bigint; st text;
begin
  select count(*), count(*) filter (where readiness_status in ('ready', 'stale'))
    into n_h, n_ready from public.fpl_projection_fixture_readiness where in_horizon;
  if n_h = 0 then raise exception 'readiness: no fixtures in the projection horizon'; end if;
  begin
    -- 1. A model switch with no rows yet: every horizon fixture is missing.
    update public.production_models set model_version = 'zz_regression_test' where component = 'fpl_player_projection';
    if exists (select 1 from public.fpl_projection_fixture_readiness where in_horizon and readiness_status <> 'missing') then
      raise exception 'readiness did not follow the production model switch';
    end if;
    if (select status from public.check_model_integrity() where check_name = 'fpl_projection_readiness') <> 'failed' then
      raise exception 'fpl_projection_readiness check did not fail after a model switch with no projections';
    end if;
    update public.production_models set model_version = 'leaguewide_v6' where component = 'fpl_player_projection';
    -- 2. Remove one ready fixture's rows: it alone becomes missing.
    select fixture_id, home_team_id into fx, tm from public.fpl_projection_fixture_readiness
      where in_horizon and readiness_status = 'ready' order by fixture_id limit 1;
    if fx is not null then
      delete from public.fpl_player_projections where fixture_id = fx and model_version = 'leaguewide_v6'
        and fpl_player_id in (select fpl_player_id from public.fpl_players where season_id = public.fpl_current_season_id() and canonical_team_id = tm);
      select readiness_status into st from public.fpl_projection_fixture_readiness where fixture_id = fx;
      if st <> 'partial' then raise exception 'removing one side''s players should make fixture % partial, got %', fx, st; end if;
      delete from public.fpl_player_projections where fixture_id = fx and model_version = 'leaguewide_v6';
      select readiness_status into st from public.fpl_projection_fixture_readiness where fixture_id = fx;
      if st <> 'missing' then raise exception 'removing all rows should make fixture % missing, got %', fx, st; end if;
      if (select count(*) filter (where readiness_status in ('ready', 'stale')) from public.fpl_projection_fixture_readiness where in_horizon) <> n_ready - 1 then
        raise exception 'removing one fixture changed other fixtures'' readiness';
      end if;
    end if;
    raise exception using errcode = 'P0001', message = 'rollback-test';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback-test' then raise; end if;
  end;
end $$;
