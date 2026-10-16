-- Live definition exported from the database (function fpl_score(p_season_id bigint, p_element_type integer, p_minutes integer, p_goals integer, p_assists integer, p_clean_sheets integer, p_goals_conceded integer, p_saves integer, p_penalties_saved integer, p_penalties_missed integer, p_own_goals integer, p_yellow_cards integer, p_red_cards integer, p_bonus integer, p_defensive_contribution integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_score(p_season_id bigint, p_element_type integer, p_minutes integer, p_goals integer, p_assists integer, p_clean_sheets integer, p_goals_conceded integer, p_saves integer, p_penalties_saved integer, p_penalties_missed integer, p_own_goals integer, p_yellow_cards integer, p_red_cards integer, p_bonus integer, p_defensive_contribution integer DEFAULT 0)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.fpl_score_calc(rs, p_minutes, p_goals, p_assists, p_clean_sheets, p_goals_conceded, p_saves,
    p_penalties_saved, p_penalties_missed, p_own_goals, p_yellow_cards, p_red_cards, p_bonus, p_defensive_contribution)
  from public.fpl_scoring_rule_sets rs
  where rs.season_id = p_season_id and rs.element_type = p_element_type
$function$
;
