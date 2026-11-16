-- Live definition exported from the database (view intl_team_names).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_team_names with (security_invoker=true) as
 SELECT team,
    name,
    valid_from,
    valid_to
   FROM intl.team_names;
