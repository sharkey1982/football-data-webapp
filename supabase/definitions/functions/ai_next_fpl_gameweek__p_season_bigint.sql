-- Live definition exported from the database (function ai_next_fpl_gameweek(p_season bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_next_fpl_gameweek(p_season bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select min(fpl_event_id) from fpl_gameweeks where season_id = p_season and deadline_time > now()),
    (select min(fpl_event_id) from fpl_gameweeks where season_id = p_season and not finished))
$function$
;
