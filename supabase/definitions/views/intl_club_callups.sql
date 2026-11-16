-- Live definition exported from the database (view intl_club_callups).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_club_callups with (security_invoker=true) as
 SELECT COALESCE(p.club_wiki, p.club) AS club_key,
    min(p.club) AS club,
    min(p.club_league_country) AS league_country,
    min(p.club_slug) AS club_slug,
    max(p.club_elo) AS club_elo,
    min(p.club_elo_rank) AS club_elo_rank,
    count(*) AS players,
    count(DISTINCT p.team) AS nations,
    jsonb_agg(jsonb_build_object('team', p.team, 'slug', t.slug, 'player', p.player, 'caps', p.caps) ORDER BY p.team, p.caps DESC NULLS LAST) AS callups
   FROM (intl.squad_players p
     JOIN intl.teams t ON ((t.team = p.team)))
  WHERE ((p.list = 'current'::text) AND (p.club IS NOT NULL))
  GROUP BY COALESCE(p.club_wiki, p.club);
