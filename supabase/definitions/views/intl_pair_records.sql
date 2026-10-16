-- Live definition exported from the database (view intl_pair_records).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_pair_records with (security_invoker=true) as
 SELECT team_a,
    team_b,
    played,
    a_won,
    drawn,
    b_won,
    a_goals,
    b_goals,
    first_meeting,
    last_meeting
   FROM intl.pair_records;
