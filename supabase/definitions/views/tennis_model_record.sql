-- Live definition exported from the database (view tennis_model_record).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_model_record with (security_invoker=true) as
 WITH x AS (
         SELECT m.tour,
            m.year,
            mm.p_winner,
                CASE
                    WHEN ((m.avg_w > (1)::numeric) AND (m.avg_l > (1)::numeric)) THEN (((1)::numeric / m.avg_w) / (((1)::numeric / m.avg_w) + ((1)::numeric / m.avg_l)))
                    WHEN ((m.b365_w > (1)::numeric) AND (m.b365_l > (1)::numeric)) THEN (((1)::numeric / m.b365_w) / (((1)::numeric / m.b365_w) + ((1)::numeric / m.b365_l)))
                    WHEN ((m.ps_w > (1)::numeric) AND (m.ps_l > (1)::numeric)) THEN (((1)::numeric / m.ps_w) / (((1)::numeric / m.ps_w) + ((1)::numeric / m.ps_l)))
                    ELSE NULL::numeric
                END AS p_market
           FROM (tennis.match_model mm
             JOIN tennis.matches m USING (source_key))
          WHERE (mm.p_winner IS NOT NULL)
        )
 SELECT tour,
    year,
    count(*) AS matches,
    (round(avg(((p_winner > (0.5)::double precision))::integer), 4))::double precision AS model_right,
    (round((avg((((1)::double precision - p_winner) ^ (2)::double precision)))::numeric, 4))::double precision AS model_brier,
    count(p_market) AS market_matches,
    (round(avg(((p_market > 0.5))::integer), 4))::double precision AS market_right
   FROM x
  GROUP BY tour, year;
