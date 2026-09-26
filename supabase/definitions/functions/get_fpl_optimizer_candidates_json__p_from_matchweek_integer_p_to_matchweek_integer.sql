-- Live definition exported from the database (function get_fpl_optimizer_candidates_json(p_from_matchweek integer, p_to_matchweek integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_optimizer_candidates_json(p_from_matchweek integer, p_to_matchweek integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  from (
    select
      matchweek, fpl_player_id, web_name, team_id, team_name, fpl_position,
      price_m, expected_fpl_points, start_probability, sub_appearance_probability, expected_minutes,
      is_home, opponent_team_name
    from public.fpl_optimizer_candidate_feed_v2
    where matchweek between p_from_matchweek and p_to_matchweek
      and price_m is not null
      and expected_fpl_points is not null
  ) v;
$function$
;
