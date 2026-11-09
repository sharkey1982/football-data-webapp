-- Live definition exported from the database (view market_closing_lines).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.market_closing_lines with (security_invoker=true) as
 SELECT m.match_id,
    m.league_id,
    m.season_id,
    m.match_date,
    m.home_team_id,
    m.away_team_id,
    (((1)::numeric / x.price_home) / ((((1)::numeric / x.price_home) + ((1)::numeric / x.price_draw)) + ((1)::numeric / x.price_away))) AS p_home,
    (((1)::numeric / x.price_draw) / ((((1)::numeric / x.price_home) + ((1)::numeric / x.price_draw)) + ((1)::numeric / x.price_away))) AS p_draw,
    (((1)::numeric / x.price_away) / ((((1)::numeric / x.price_home) + ((1)::numeric / x.price_draw)) + ((1)::numeric / x.price_away))) AS p_away,
    (((1)::numeric / ou.price_over) / (((1)::numeric / ou.price_over) + ((1)::numeric / ou.price_under))) AS p_over
   FROM ((matches m
     JOIN match_odds x ON (((x.match_id = m.match_id) AND (x.market = '1x2'::text) AND (x.bookmaker = 'Avg'::text) AND x.is_closing AND (x.price_home > (1)::numeric) AND (x.price_draw > (1)::numeric) AND (x.price_away > (1)::numeric))))
     JOIN match_odds ou ON (((ou.match_id = m.match_id) AND (ou.market = 'ou25'::text) AND (ou.bookmaker = 'Avg'::text) AND ou.is_closing AND (ou.price_over > (1)::numeric) AND (ou.price_under > (1)::numeric))))
  WHERE (m.full_time_home_goals IS NOT NULL);
