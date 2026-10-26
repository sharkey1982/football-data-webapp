-- Live definition exported from the database (view tennis_ratings).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_ratings with (security_invoker=true) as
 SELECT pr.player_id,
    p.tour,
    p.slug,
    p.name,
    pr.surface,
    (round((pr.rating)::numeric, 1))::double precision AS rating,
    pr.matches,
    pr.latest_rank,
    pr.last_match
   FROM (tennis.player_ratings pr
     JOIN tennis.players p USING (player_id));
