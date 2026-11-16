-- Live definition exported from the database (view fpl_scoring_regression).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_scoring_regression with (security_invoker=true) as
 WITH gw AS (
         SELECT w.season_id,
            w.total_points,
            fpl_score_calc(rs.*, w.minutes, ((x.s ->> 'goals_scored'::text))::integer, ((x.s ->> 'assists'::text))::integer, ((x.s ->> 'clean_sheets'::text))::integer, ((x.s ->> 'goals_conceded'::text))::integer, ((x.s ->> 'saves'::text))::integer, ((x.s ->> 'penalties_saved'::text))::integer, ((x.s ->> 'penalties_missed'::text))::integer, ((x.s ->> 'own_goals'::text))::integer, ((x.s ->> 'yellow_cards'::text))::integer, ((x.s ->> 'red_cards'::text))::integer, ((x.s ->> 'bonus'::text))::integer, COALESCE(((x.s ->> 'defensive_contribution'::text))::integer, 0)) AS calc
           FROM (((fpl_player_gameweeks w
             CROSS JOIN LATERAL ( SELECT (w.source_payload -> 'stats'::text) AS s) x)
             JOIN fpl_players p ON (((p.fpl_player_id = w.fpl_player_id) AND (p.season_id = w.season_id))))
             LEFT JOIN fpl_scoring_rule_sets rs ON (((rs.season_id = w.season_id) AND (rs.element_type = p.element_type))))
          WHERE (w.source_payload ? 'stats'::text)
        ), hist AS (
         SELECT h.season_id,
            h.fpl_code,
            sum(h.total_points) AS actual,
            ((((sum(fpl_score_calc(rs.*, h.minutes, h.goals_scored, h.assists, h.clean_sheets, h.goals_conceded, h.saves, 0, 0, 0, h.yellow_cards, h.red_cards, h.bonus, 0)))::numeric + COALESCE(((max(t.own_goals))::numeric * max(rs.own_goal_pts)), (0)::numeric)) + COALESCE(((max(t.penalties_missed))::numeric * max(rs.penalty_miss_pts)), (0)::numeric)) + COALESCE(((max(t.penalties_saved))::numeric * max(rs.penalty_save_pts)), (0)::numeric)) AS calc,
            bool_or((rs.defcon_pts IS NOT NULL)) AS defcon_unobserved
           FROM ((fpl_player_gameweek_history h
             JOIN fpl_player_season_totals t USING (season_id, fpl_code))
             LEFT JOIN fpl_scoring_rule_sets rs ON (((rs.season_id = h.season_id) AND (rs.element_type = t.element_type))))
          GROUP BY h.season_id, h.fpl_code
        )
 SELECT s.season_id,
    s.start_year,
    'match'::text AS level,
    (count(*))::integer AS rows_tested,
    (count(*) FILTER (WHERE (gw.calc IS DISTINCT FROM gw.total_points)))::integer AS mismatches,
    'Every stat observed; engine must equal FPL''s total for every player in every match.'::text AS note
   FROM (gw
     JOIN seasons s USING (season_id))
  GROUP BY s.season_id, s.start_year
UNION ALL
 SELECT s.season_id,
    s.start_year,
    'player_season'::text AS level,
    (count(*))::integer AS rows_tested,
    (count(*) FILTER (WHERE
        CASE
            WHEN hist.defcon_unobserved THEN ((hist.calc IS NULL) OR (((hist.actual)::numeric - hist.calc) < (0)::numeric) OR ((((hist.actual)::numeric - hist.calc) % (2)::numeric) <> (0)::numeric))
            ELSE (hist.calc IS DISTINCT FROM (hist.actual)::numeric)
        END))::integer AS mismatches,
        CASE
            WHEN bool_or(hist.defcon_unobserved) THEN 'Own goals and penalties from season totals; defensive contributions are not in the history, so the remainder must be a non-negative multiple of 2.'::text
            ELSE 'Own goals and penalties from season totals; engine must equal FPL''s season total for every player.'::text
        END AS note
   FROM (hist
     JOIN seasons s USING (season_id))
  GROUP BY s.season_id, s.start_year;
