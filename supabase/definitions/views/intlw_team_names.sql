-- Live definition exported from the database (view intlw_team_names).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_team_names with (security_invoker=true) as
 SELECT team,
    name,
    valid_from,
    valid_to
   FROM intlw.team_names;
