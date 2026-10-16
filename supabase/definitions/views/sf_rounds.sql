-- Live definition exported from the database (view sf_rounds).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_rounds with (security_invoker=true) as
 SELECT season_id,
    number,
    kind,
    deadline_at,
    kickoff_at,
    state
   FROM sf.rounds;
