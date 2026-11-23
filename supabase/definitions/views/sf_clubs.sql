-- Live definition exported from the database (view sf_clubs).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_clubs with (security_invoker=true) as
 SELECT c.universe_id,
    c.id AS club_id,
    c.name,
    c.short,
    m.name AS manager,
    c.identity_category
   FROM (sf.clubs c
     JOIN sf.managers m ON (((m.universe_id = c.universe_id) AND (m.id = c.manager_id))));
