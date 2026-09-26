-- Live definition exported from the database (function get_league_ids_with_results()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_league_ids_with_results()
 RETURNS SETOF integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select l.league_id from leagues l
  where exists (select 1 from matches m where m.league_id = l.league_id)
$function$
;
