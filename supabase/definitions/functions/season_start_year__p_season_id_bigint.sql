-- Live definition exported from the database (function season_start_year(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.season_start_year(p_season_id bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The chronological sort key for a season. season_id is NOT in date
  -- order (historic seasons were added after 2026/27); sort by this.
  select start_year from public.seasons where season_id = p_season_id
$function$
;
