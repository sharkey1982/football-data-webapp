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
  -- Latest by start_year: season_id is not in date order.
  select s.season_id from public.seasons s
   where s.start_year = (select max(sg.start_year) from public.seasons sg
                          where sg.season_id in (select g.season_id from public.fpl_gameweeks g));
$function$
;
