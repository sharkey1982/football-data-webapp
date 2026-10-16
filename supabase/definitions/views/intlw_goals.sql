-- Live definition exported from the database (view intlw_goals).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_goals with (security_invoker=true) as
 SELECT match_key,
    seq,
    team,
    scorer,
    minute,
    own_goal,
    penalty
   FROM intlw.goals;
