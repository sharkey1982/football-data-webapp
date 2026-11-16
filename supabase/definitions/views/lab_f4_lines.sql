-- Live definition exported from the database (view lab_f4_lines).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.lab_f4_lines with (security_invoker=true) as
 SELECT m.match_id,
    m.league_id,
    s.start_year,
    m.match_date,
    m.home_team_id,
    m.away_team_id,
    m.full_time_home_goals AS hg,
    m.full_time_away_goals AS ag,
    c.basic_home AS p_home,
    c.basic_draw AS p_draw,
    c.basic_away AS p_away,
    (((1)::numeric / ou.price_over) / (((1)::numeric / ou.price_over) + ((1)::numeric / ou.price_under))) AS p_over
   FROM (((matches m
     JOIN seasons s USING (season_id))
     JOIN lab_market_probs c ON (((c.match_id = m.match_id) AND (c.bookmaker = 'Avg'::text) AND c.is_closing)))
     JOIN match_odds ou ON (((ou.match_id = m.match_id) AND (ou.market = 'ou25'::text) AND (ou.bookmaker = 'Avg'::text) AND ou.is_closing AND (ou.price_over > (1)::numeric) AND (ou.price_under > (1)::numeric))))
  WHERE (((m.league_id >= 1) AND (m.league_id <= 4)) AND (s.start_year >= 2019) AND (m.full_time_home_goals IS NOT NULL));
