-- Live definition exported from the database (view fixture_market_latest).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_market_latest with (security_invoker=true) as
 SELECT DISTINCT ON (s.fixture_id) s.fixture_id,
    s.captured_at,
    s.price_home,
    s.price_draw,
    s.price_away,
    (((1)::numeric / s.price_home) / ((((1)::numeric / s.price_home) + ((1)::numeric / s.price_draw)) + ((1)::numeric / s.price_away))) AS market_home,
    (((1)::numeric / s.price_draw) / ((((1)::numeric / s.price_home) + ((1)::numeric / s.price_draw)) + ((1)::numeric / s.price_away))) AS market_draw,
    (((1)::numeric / s.price_away) / ((((1)::numeric / s.price_home) + ((1)::numeric / s.price_draw)) + ((1)::numeric / s.price_away))) AS market_away
   FROM (fixture_odds_snapshots s
     JOIN fixtures f USING (fixture_id))
  WHERE ((s.bookmaker = 'Avg'::text) AND (s.market = '1x2'::text) AND (s.captured_at < ((f.kickoff_date + COALESCE(f.kickoff_time, '12:00:00'::time without time zone)) AT TIME ZONE 'Europe/London'::text)))
  ORDER BY s.fixture_id, s.is_closing DESC, s.captured_at DESC;
