-- Live definition exported from the database (view tennis_tournaments).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_tournaments with (security_invoker=true) as
 SELECT t.tournament_id,
    t.tour,
    t.name,
    t.slug,
    min(m.year) AS first_year,
    max(m.year) AS last_year,
    count(*) AS matches
   FROM (tennis.tournaments t
     JOIN tennis.matches m ON ((m.tournament_id = t.tournament_id)))
  GROUP BY t.tournament_id;
