-- Live definition exported from the database (function fpl_current_season_id()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_current_season_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- The FPL season in play: the latest season FPL has published gameweeks
  -- for. Rolls over by itself when next season's bootstrap is first loaded.
  select max(season_id) from public.fpl_gameweeks;
$function$
;
