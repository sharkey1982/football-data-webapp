-- Live definition exported from the database (function get_fpl_optimizer_candidates(p_from_matchweek integer, p_to_matchweek integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_optimizer_candidates(p_from_matchweek integer, p_to_matchweek integer)
 RETURNS TABLE(matchweek integer, fpl_player_id integer, web_name text, team_id bigint, team_name text, fpl_position integer, price_m numeric, expected_fpl_points numeric, start_probability numeric, sub_appearance_probability numeric, expected_minutes numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    v.matchweek,
    v.fpl_player_id,
    v.web_name,
    v.team_id,
    v.team_name,
    v.fpl_position,
    v.price_m,
    v.expected_fpl_points,
    v.start_probability,
    v.sub_appearance_probability,
    v.expected_minutes
  from public.fpl_optimizer_candidate_feed_v2 v
  where v.matchweek between p_from_matchweek and p_to_matchweek
    and v.price_m is not null
    and v.expected_fpl_points is not null;
end;
$function$
;
