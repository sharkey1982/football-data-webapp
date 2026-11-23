-- Live definition exported from the database (view intl_squad_snapshot_players).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_squad_snapshot_players with (security_invoker=true) as
 SELECT p.team,
    t.slug,
    p.version_at,
    p.list,
    p.player_key,
    p.player,
    p.wiki_title,
    p."position",
    p.number,
    p.caps,
    p.goals,
    p.club,
    p.club_slug,
    p.status,
    p.latest_date,
    p.latest_text
   FROM (intl.squad_snapshot_players p
     JOIN intl.teams t ON ((t.team = p.team)));
