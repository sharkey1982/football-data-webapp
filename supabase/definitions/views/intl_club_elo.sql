-- Live definition exported from the database (view intl_club_elo).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_club_elo with (security_invoker=true) as
 SELECT club,
    country,
    level,
    elo,
    rank,
    club_slug,
    fetched_on,
    ( SELECT count(*) AS count
           FROM intl.squad_players p
          WHERE ((p.list = 'current'::text) AND (p.clubelo_name = e.club))) AS internationals
   FROM intl.club_elo e;
