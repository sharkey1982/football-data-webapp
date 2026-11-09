-- Live definition exported from the database (view model_vs_market_by_league).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.model_vs_market_by_league with (security_invoker=true) as
 SELECT league_id,
    min(match_date) AS from_date,
    max(match_date) AS to_date,
    count(*) AS matches,
    avg((- ln(
        CASE result
            WHEN 'H'::text THEN p_home
            WHEN 'D'::text THEN p_draw
            ELSE p_away
        END))) AS model_log_loss,
    avg((- ln(
        CASE result
            WHEN 'H'::text THEN m_home
            WHEN 'D'::text THEN m_draw
            ELSE m_away
        END))) AS market_log_loss,
    avg((((((
        CASE result
            WHEN 'H'::text THEN 1
            ELSE 0
        END)::numeric - p_home) ^ (2)::numeric) + (((
        CASE result
            WHEN 'D'::text THEN 1
            ELSE 0
        END)::numeric - p_draw) ^ (2)::numeric)) + (((
        CASE result
            WHEN 'A'::text THEN 1
            ELSE 0
        END)::numeric - p_away) ^ (2)::numeric))) AS model_brier,
    avg((((((
        CASE result
            WHEN 'H'::text THEN 1
            ELSE 0
        END)::numeric - m_home) ^ (2)::numeric) + (((
        CASE result
            WHEN 'D'::text THEN 1
            ELSE 0
        END)::numeric - m_draw) ^ (2)::numeric)) + (((
        CASE result
            WHEN 'A'::text THEN 1
            ELSE 0
        END)::numeric - m_away) ^ (2)::numeric))) AS market_brier
   FROM model_scorecard_matches
  WHERE ((m_home IS NOT NULL) AND (p_home IS NOT NULL))
  GROUP BY league_id;
