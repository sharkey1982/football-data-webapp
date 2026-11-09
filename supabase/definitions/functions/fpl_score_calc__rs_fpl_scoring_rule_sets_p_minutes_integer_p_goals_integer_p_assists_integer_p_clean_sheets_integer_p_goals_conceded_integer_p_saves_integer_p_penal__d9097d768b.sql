-- Live definition exported from the database (function fpl_score_calc(rs fpl_scoring_rule_sets, p_minutes integer, p_goals integer, p_assists integer, p_clean_sheets integer, p_goals_conceded integer, p_saves integer, p_penalties_saved integer, p_penalties_missed integer, p_own_goals integer, p_yellow_cards integer, p_red_cards integer, p_bonus integer, p_defensive_contribution integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_score_calc(rs fpl_scoring_rule_sets, p_minutes integer, p_goals integer, p_assists integer, p_clean_sheets integer, p_goals_conceded integer, p_saves integer, p_penalties_saved integer, p_penalties_missed integer, p_own_goals integer, p_yellow_cards integer, p_red_cards integer, p_bonus integer, p_defensive_contribution integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (
      case when p_minutes >= rs.full_min then rs.full_pts
           when p_minutes >= rs.appearance_min then rs.appearance_pts else 0 end
    + p_goals * coalesce(rs.goal_pts, 0)
    + p_assists * coalesce(rs.assist_pts, 0)
    + case when p_clean_sheets > 0 and p_minutes >= rs.clean_sheet_min then rs.clean_sheet_pts else 0 end
    + coalesce(floor(p_saves / rs.saves_per) * rs.save_pts, 0)
    + coalesce(floor(p_goals_conceded / rs.conceded_per) * rs.conceded_pts, 0)
    + p_penalties_saved * coalesce(rs.penalty_save_pts, 0)
    + p_penalties_missed * coalesce(rs.penalty_miss_pts, 0)
    + p_own_goals * coalesce(rs.own_goal_pts, 0)
    + p_yellow_cards * coalesce(rs.yellow_pts, 0)
    + p_red_cards * coalesce(rs.red_pts, 0)
    + case when coalesce(p_defensive_contribution, 0) >= rs.defcon_min then rs.defcon_pts else 0 end
  )::int + coalesce(p_bonus, 0)
$function$
;
