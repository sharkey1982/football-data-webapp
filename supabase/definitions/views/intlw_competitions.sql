-- Live definition exported from the database (view intlw_competitions).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_competitions with (security_invoker=true) as
 SELECT name,
    slug,
    kind,
    confederation,
    matches
   FROM intlw.competitions;
