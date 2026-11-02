-- Live definition exported from the database (view fpl_scoring_rule_sets).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_scoring_rule_sets with (security_invoker=true) as
 SELECT r.season_id,
    pos.element_type,
    pos.code AS "position",
    max(r.points) FILTER (WHERE (r.rule_code = 'appearance_under_60'::text)) AS appearance_pts,
    max(r.threshold) FILTER (WHERE (r.rule_code = 'appearance_under_60'::text)) AS appearance_min,
    max(r.points) FILTER (WHERE (r.rule_code = 'appearance_60_plus'::text)) AS full_pts,
    max(r.threshold) FILTER (WHERE (r.rule_code = 'appearance_60_plus'::text)) AS full_min,
    max(r.points) FILTER (WHERE (r.rule_code = 'goal'::text)) AS goal_pts,
    max(r.points) FILTER (WHERE (r.rule_code = 'assist'::text)) AS assist_pts,
    max(r.points) FILTER (WHERE (r.rule_code = 'clean_sheet'::text)) AS clean_sheet_pts,
    max(r.threshold) FILTER (WHERE (r.rule_code = 'clean_sheet'::text)) AS clean_sheet_min,
    max(r.points) FILTER (WHERE (r.rule_code = 'save'::text)) AS save_pts,
    max(r.threshold) FILTER (WHERE (r.rule_code = 'save'::text)) AS saves_per,
    max(r.points) FILTER (WHERE (r.rule_code = 'goals_conceded'::text)) AS conceded_pts,
    max(r.threshold) FILTER (WHERE (r.rule_code = 'goals_conceded'::text)) AS conceded_per,
    max(r.points) FILTER (WHERE (r.rule_code = 'penalty_save'::text)) AS penalty_save_pts,
    max(r.points) FILTER (WHERE (r.rule_code = 'penalty_miss'::text)) AS penalty_miss_pts,
    max(r.points) FILTER (WHERE (r.rule_code = 'own_goal'::text)) AS own_goal_pts,
    max(r.points) FILTER (WHERE (r.rule_code = 'yellow_card'::text)) AS yellow_pts,
    max(r.points) FILTER (WHERE (r.rule_code = 'red_card'::text)) AS red_pts,
    max(r.points) FILTER (WHERE (r.rule_code = 'defensive_contribution'::text)) AS defcon_pts,
    max(r.threshold) FILTER (WHERE (r.rule_code = 'defensive_contribution'::text)) AS defcon_min
   FROM (fpl_scoring_rules r
     JOIN ( VALUES (1,'GK'::text), (2,'DEF'::text), (3,'MID'::text), (4,'FWD'::text)) pos(element_type, code) ON (((r.player_position IS NULL) OR (r.player_position = pos.code))))
  GROUP BY r.season_id, pos.element_type, pos.code;
