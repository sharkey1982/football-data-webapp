-- Live definition exported from the database (view intlw_groups).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_groups with (security_invoker=true) as
 SELECT g.group_key,
    s.edition_key,
    s.code AS stage_code,
    g.label,
    g.league,
    g.size,
    ARRAY( SELECT gm.team
           FROM intlw.group_members gm
          WHERE (gm.group_key = g.group_key)
          ORDER BY gm.team) AS teams
   FROM (intlw.groups g
     JOIN intlw.stages s ON ((s.stage_key = g.stage_key)));
