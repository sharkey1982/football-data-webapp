-- Live definition exported from the database (view intlw_squad_club_strength).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_squad_club_strength with (security_invoker=true) as
 SELECT p.team,
    t.slug,
    ts.confederation,
    count(*) AS players,
    count(*) FILTER (WHERE (p.club_league_country = p.team)) AS at_home,
    count(*) FILTER (WHERE ((p.club_league_country IS NOT NULL) AND (p.club_league_country <> p.team))) AS abroad,
    count(p.club_elo) AS rated,
    round(avg(p.club_elo), 0) AS avg_club_elo,
    count(DISTINCT p.club_league_country) AS league_countries
   FROM ((intlw.squad_players p
     JOIN intlw.teams t ON ((t.team = p.team)))
     LEFT JOIN intlw.team_summary ts ON ((ts.team = p.team)))
  WHERE (p.list = 'current'::text)
  GROUP BY p.team, t.slug, ts.confederation;
