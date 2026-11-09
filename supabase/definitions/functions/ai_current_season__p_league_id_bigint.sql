-- Live definition exported from the database (function ai_current_season(p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_current_season(p_league_id bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select se.season_id from seasons se where se.season_id in (
    select season_id from fixtures where league_id = p_league_id
    union all select season_id from matches where league_id = p_league_id)
   order by se.start_year desc limit 1
$function$
;
