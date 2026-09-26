-- Live definition exported from the database (function get_fpl_optimizer_candidates_scenario_json(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text, p_from_matchweek integer, p_to_matchweek integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_optimizer_candidates_scenario_json(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text, p_from_matchweek integer, p_to_matchweek integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  from (
    select
      f.matchweek, pr.fpl_player_id, fp.web_name, fp.canonical_team_id as team_id,
      t.canonical_name as team_name, fp.element_type as fpl_position,
      (fp.now_cost::numeric / 10) as price_m,
      pr.expected_fpl_points, pr.start_probability, pr.sub_appearance_probability, pr.expected_minutes,
      (fp.canonical_team_id = f.home_team_id) as is_home,
      coalesce(opp.canonical_name, 'Unknown') as opponent_team_name,
      (pr.expected_fpl_points * (0.5 + 0.5 * coalesce(pr.start_probability, 0))) as captain_score
    from public.fpl_player_projections pr
    join public.fixtures f on f.fixture_id = pr.fixture_id
    join public.fpl_players fp on fp.fpl_player_id = pr.fpl_player_id and fp.season_id = pr.season_id
    left join public.teams t on t.team_id = fp.canonical_team_id
    left join public.teams opp on opp.team_id = (case when fp.canonical_team_id = f.home_team_id then f.away_team_id else f.home_team_id end)
    where pr.season_id = p_season_id
      and f.league_id = p_league_id
      and pr.model_version = p_model_version
      and pr.scenario_key = p_scenario_key
      and f.matchweek between p_from_matchweek and p_to_matchweek
      and fp.now_cost is not null
      and pr.expected_fpl_points is not null
  ) v;
$function$
;
