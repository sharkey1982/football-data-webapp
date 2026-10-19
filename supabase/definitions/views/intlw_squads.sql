-- Live definition exported from the database (view intlw_squads).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_squads with (security_invoker=true) as
 SELECT s.team,
    t.slug,
    s.wiki_title,
    s.revision_at,
    s.intro,
    s.caps_as_of,
    s.players,
    s.fetched_at
   FROM (intlw.squads s
     JOIN intlw.teams t ON ((t.team = s.team)));
