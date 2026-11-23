-- Live definition exported from the database (view tennis_match_model).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_match_model with (security_invoker=true) as
 SELECT source_key,
    p_winner
   FROM tennis.match_model;
