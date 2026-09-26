-- Live definition exported from the database (function get_season_player_projections_json(p_matchweek integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_season_player_projections_json(p_matchweek integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with target_fixtures as materialized (
  select fixture_id, matchweek, kickoff_date, home_team_id, away_team_id, predicted_home_goals, predicted_away_goals
  from public.fixtures
  where matchweek = p_matchweek and season_id = (SELECT public.fpl_current_season_id())
    and predicted_home_goals is not null and predicted_away_goals is not null
),
alloc as materialized (
  select a.*
  from public.fpl_projection_leaguewide_allocation_v2 a
  join target_fixtures tf on tf.fixture_id = a.fixture_id
),
dc as materialized (
  select d.*
  from public.fpl_defensive_contribution_projection_leaguewide d
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
  join public.fpl_players p on p.fpl_player_id = alloc.fpl_player_id and p.season_id = (SELECT public.fpl_current_season_id())
  left join dc on dc.fixture_id = alloc.fixture_id and dc.fpl_player_id = alloc.fpl_player_id
  left join bonus on bonus.fixture_id = alloc.fixture_id and bonus.fpl_player_id = alloc.fpl_player_id
) t;
$function$
;
