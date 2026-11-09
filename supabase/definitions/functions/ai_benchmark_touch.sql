-- Live definition exported from the database (function ai_benchmark_touch()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_benchmark_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (new.question, new.ground_truth_sql, new.must_include, new.must_not_claim, new.expected_behaviour)
       is distinct from (old.question, old.ground_truth_sql, old.must_include, old.must_not_claim, old.expected_behaviour) then
    new.version := old.version + 1;
  end if;
  return new;
end $function$
;
