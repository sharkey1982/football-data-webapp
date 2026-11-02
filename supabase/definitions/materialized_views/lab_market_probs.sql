-- Live definition exported from the database (materialized_view lab_market_probs).
-- Do not edit here: change it with a migration; the next export will reflect it.

create materialized view public.lab_market_probs as
 SELECT o.match_id,
    o.bookmaker,
    o.is_closing,
    ((((1)::numeric / o.price_home) + ((1)::numeric / o.price_draw)) + ((1)::numeric / o.price_away)) AS overround,
    (((1)::numeric / o.price_home) / ((((1)::numeric / o.price_home) + ((1)::numeric / o.price_draw)) + ((1)::numeric / o.price_away))) AS basic_home,
    (((1)::numeric / o.price_draw) / ((((1)::numeric / o.price_home) + ((1)::numeric / o.price_draw)) + ((1)::numeric / o.price_away))) AS basic_draw,
    (((1)::numeric / o.price_away) / ((((1)::numeric / o.price_home) + ((1)::numeric / o.price_draw)) + ((1)::numeric / o.price_away))) AS basic_away,
    x.pw[1] AS power_home,
    x.pw[2] AS power_draw,
    x.pw[3] AS power_away,
    x.sh[1] AS shin_home,
    x.sh[2] AS shin_draw,
    x.sh[3] AS shin_away
   FROM (match_odds o
     CROSS JOIN LATERAL ( SELECT lab_devig_power(o.price_home, o.price_draw, o.price_away) AS pw,
            lab_devig_shin(o.price_home, o.price_draw, o.price_away) AS sh) x)
  WHERE ((o.market = '1x2'::text) AND (o.bookmaker = ANY (ARRAY['Avg'::text, 'PS'::text, 'BFE'::text, 'B365'::text, 'Max'::text])) AND (o.price_home > (1)::numeric) AND (o.price_draw > (1)::numeric) AND (o.price_away > (1)::numeric) AND (EXISTS ( SELECT 1
           FROM matches m
          WHERE ((m.match_id = o.match_id) AND (m.match_date >= '2016-07-01'::date)))));
