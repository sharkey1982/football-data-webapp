-- Live definition exported from the database (function intlw_replace_goals(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intlw_replace_goals(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from intlw.goals g
  where g.match_key in (select distinct r->>'match_key' from jsonb_array_elements(rows) r);
  insert into intlw.goals (match_key, seq, team, scorer, minute, own_goal, penalty)
  select r->>'match_key', (r->>'seq')::int, r->>'team', r->>'scorer', (r->>'minute')::int,
         (r->>'own_goal')::boolean, (r->>'penalty')::boolean
  from jsonb_array_elements(rows) r;
end $function$
;
