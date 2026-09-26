-- Live definition exported from the database (function refresh_model_scorecard()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_model_scorecard()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  refresh materialized view concurrently public.model_scorecard_matches;
  return (select count(*)::integer from public.model_scorecard_matches);
end $function$
;
