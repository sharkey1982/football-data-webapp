-- ============================================================================
-- get_season_player_projections_json read from fpl_fixture_bonus_projection_v3,
-- which no longer exists: every call failed with "relation does not exist".
-- Nothing calls it (it appears only in the generated types), so it had been
-- broken unnoticed. The bonus projection now lives in
-- fpl_fixture_bonus_montecarlo_v1, which has the same three columns this
-- function uses. Only that source changes. Verified: 667 players for matchweek
-- 6, 526 of them with a bonus value.
--
-- A SWEEP FOR THE SAME PROBLEM found no other case: two static scans came back
-- clean, and the strong check -- re-creating all 79 functions from their own
-- definitions with check_function_bodies on, in a rolled-back transaction --
-- validated every one. Re-run that after dropping or renaming anything;
-- Postgres does NOT check function bodies when the objects they read change:
--
--   begin; set local check_function_bodies = on;
--   do $$ declare r record; begin
--     for r in select oid::regprocedure sig, pg_get_functiondef(oid) def from pg_proc
--              where pronamespace='public'::regnamespace
--                and not exists (select 1 from pg_depend d where d.objid=oid and d.deptype='e')
--     loop execute r.def; end loop; end $$;
--   rollback;
-- ============================================================================
create or replace function public.get_season_player_projections_json(p_matchweek integer)
 returns jsonb language sql stable set search_path to 'public', 'pg_temp'
as $function$
with target_fixtures as materialized (
  select fixture_id, matchweek, kickoff_date, home_team_id, away_team_id, predicted_home_goals, predicted_away_goals
  from public.fixtures
  where matchweek = p_matchweek and season_id = 13
    and predicted_home_goals is not null and predicted_away_goals is not null
),
alloc as materialized (
  select a.* from public.fpl_projection_leaguewide_allocation_v2 a
  join target_fixtures tf on tf.fixture_id = a.fixture_id
),
dc as materialized (
  select d.* from public.fpl_defensive_contribution_projection_leaguewide d
  join target_fixtures tf on tf.fixture_id = d.fixture_id
),
bonus as materialized (
  select b.fixture_id, b.fpl_player_id, b.expected_bonus_points
  from public.fpl_fixture_bonus_montecarlo_v1 b
  join target_fixtures tf on tf.fixture_id = b.fixture_id
)
select jsonb_agg(row_to_json(t)) from (
  select alloc.fixture_id, tf.matchweek, tf.kickoff_date, alloc.team_id, p.web_name, alloc.fpl_player_id,
    alloc.element_type as fpl_position, alloc.real_tactical_role as tactical_role, alloc.expected_minutes,
    alloc.prob_starting_xi as start_probability, alloc.prob_sub_appearance as sub_appearance_probability,
    alloc.shrunk_xg90, alloc.shrunk_xa90, alloc.expected_goals, alloc.expected_assists,
    exp(-(case when alloc.team_id = tf.home_team_id then tf.predicted_away_goals else tf.predicted_home_goals end))::numeric as clean_sheet_probability,
    coalesce(dc.defensive_contribution_probability, 0) as defensive_contribution_probability,
    coalesce(bonus.expected_bonus_points, 0) as experimental_expected_bonus
  from alloc
  join target_fixtures tf on tf.fixture_id = alloc.fixture_id
  join public.fpl_players p on p.fpl_player_id = alloc.fpl_player_id and p.season_id = 13
  left join dc on dc.fixture_id = alloc.fixture_id and dc.fpl_player_id = alloc.fpl_player_id
  left join bonus on bonus.fixture_id = alloc.fixture_id and bonus.fpl_player_id = alloc.fpl_player_id
) t;
$function$;
