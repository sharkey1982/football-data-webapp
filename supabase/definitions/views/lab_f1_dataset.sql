-- Live definition exported from the database (view lab_f1_dataset).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.lab_f1_dataset with (security_invoker=true) as
 SELECT m.match_id,
    m.league_id,
    s.start_year,
    m.match_date,
        CASE
            WHEN (m.full_time_home_goals > m.full_time_away_goals) THEN 'H'::text
            WHEN (m.full_time_home_goals = m.full_time_away_goals) THEN 'D'::text
            ELSE 'A'::text
        END AS result,
    e.p_home AS dc_home,
    e.p_draw AS dc_draw,
    e.p_away AS dc_away,
    e.as_of_date AS dc_as_of,
    c.basic_home AS close_home,
    c.basic_draw AS close_draw,
    c.basic_away AS close_away,
    o.basic_home AS open_home,
    o.basic_draw AS open_draw,
    o.basic_away AS open_away
   FROM ((((matches m
     JOIN seasons s USING (season_id))
     JOIN model_experiment_predictions e ON (((e.match_id = m.match_id) AND (e.experiment = 'dc_walkforward_v1'::text) AND (e.variant = 'hl180_s0'::text) AND (e.as_of_date < m.match_date))))
     JOIN lab_market_probs c ON (((c.match_id = m.match_id) AND (c.bookmaker = 'Avg'::text) AND c.is_closing)))
     JOIN lab_market_probs o ON (((o.match_id = m.match_id) AND (o.bookmaker = 'Avg'::text) AND (NOT o.is_closing))))
  WHERE (((m.league_id >= 1) AND (m.league_id <= 4)) AND (s.start_year >= 2019) AND (m.full_time_home_goals IS NOT NULL));
