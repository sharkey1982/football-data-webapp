-- Live definition exported from the database (view intl_goals).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_goals with (security_invoker=true) as
 SELECT match_key,
    seq,
    team,
    scorer,
    minute,
    own_goal,
    penalty
   FROM intl.goals;
