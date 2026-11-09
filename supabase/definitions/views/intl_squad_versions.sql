-- Live definition exported from the database (view intl_squad_versions).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_squad_versions with (security_invoker=true) as
 SELECT v.team,
    t.slug,
    v.version_at,
    v.intro,
    v.intro_signature,
    v.players
   FROM (intl.squad_versions v
     JOIN intl.teams t ON ((t.team = v.team)));
