-- Live definition exported from the database (function ai_season_label(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_season_label(p_season_id bigint)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select start_year || '/' || right(end_year::text, 2) from seasons where season_id = p_season_id
$function$
;
