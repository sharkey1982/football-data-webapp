-- Live definition exported from the database (view tennis_player_splits).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_player_splits with (security_invoker=true) as
 SELECT s.player_id,
    p.tour,
    p.slug,
    s.year,
    s.surface,
    s.level,
    s.won,
    s.lost,
    s.titles,
    s.finals
   FROM (tennis.player_splits s
     JOIN tennis.players p USING (player_id));
