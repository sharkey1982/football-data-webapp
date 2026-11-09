-- Live definition exported from the database (function previous_season_id(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.previous_season_id(p_season_id bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The season immediately before p_season_id by start_year (null if none).
  select s.season_id from public.seasons s
   where s.start_year < (select start_year from public.seasons where season_id = p_season_id)
   order by s.start_year desc
   limit 1
$function$
;
