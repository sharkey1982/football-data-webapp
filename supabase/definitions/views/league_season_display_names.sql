-- Live definition exported from the database (view league_season_display_names).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.league_season_display_names with (security_invoker=true) as
 SELECT l.league_id,
    s.season_id,
    league_name_for_season(l.league_id, s.season_id) AS name
   FROM (leagues l
     CROSS JOIN seasons s);
