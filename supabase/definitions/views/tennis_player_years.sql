-- Live definition exported from the database (view tennis_player_years).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_player_years with (security_invoker=true) as
 SELECT y.player_id,
    p.tour,
    p.slug,
    p.name,
    y.year,
    y.won,
    y.lost,
    y.titles,
    y.finals,
    y.end_rank,
    y.end_points,
    y.best_rank
   FROM (tennis.player_years y
     JOIN tennis.players p USING (player_id));
