-- Live definition exported from the database (view nfl_teams).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_teams with (security_invoker=true) as
 SELECT franchise,
    slug,
    name,
    short_name,
    conference,
    division
   FROM nfl.franchises;
