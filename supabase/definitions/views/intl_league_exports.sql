-- Live definition exported from the database (view intl_league_exports).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_league_exports with (security_invoker=true) as
 SELECT club_league_country AS league_country,
    count(*) AS players,
    count(DISTINCT team) AS nations,
    count(DISTINCT COALESCE(club_wiki, club)) AS clubs,
    count(*) FILTER (WHERE (team <> club_league_country)) AS foreign_players
   FROM intl.squad_players p
  WHERE ((list = 'current'::text) AND (club_league_country IS NOT NULL))
  GROUP BY club_league_country;
