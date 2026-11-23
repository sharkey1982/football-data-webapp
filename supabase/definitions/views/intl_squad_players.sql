-- Live definition exported from the database (view intl_squad_players).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_squad_players with (security_invoker=true) as
 SELECT p.team,
    t.slug,
    p.list,
    p.seq,
    p.number,
    p."position",
    p.player,
    p.wiki_title,
    p.birth_date,
    p.caps,
    p.goals,
    p.club,
    p.club_country,
    p.latest_date,
    p.latest_text,
    p.status,
    p.club_wiki,
    p.club_league_country,
    p.club_slug,
    p.clubelo_name,
    p.club_elo,
    p.club_elo_rank
   FROM (intl.squad_players p
     JOIN intl.teams t ON ((t.team = p.team)));
