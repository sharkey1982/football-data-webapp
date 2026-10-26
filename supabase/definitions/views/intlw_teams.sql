-- Live definition exported from the database (view intlw_teams).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_teams with (security_invoker=true) as
 SELECT team,
    slug,
    confederation,
    first_match,
    last_match,
    matches,
    (confederation IS NOT NULL) AS is_confederation_member
   FROM intlw.teams;
