-- Live definition exported from the database (view intl_groups).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_groups with (security_invoker=true) as
 SELECT g.group_key,
    s.edition_key,
    s.code AS stage_code,
    g.label,
    g.league,
    g.size,
    ARRAY( SELECT gm.team
           FROM intl.group_members gm
          WHERE (gm.group_key = g.group_key)
          ORDER BY gm.team) AS teams
   FROM (intl.groups g
     JOIN intl.stages s ON ((s.stage_key = g.stage_key)));
