-- Live definition exported from the database (function earlier_season(a bigint, b bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.earlier_season(a bigint, b bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- least(a, b) by start_year: nulls ignored, as least() does.
  select case when a is null then b
              when b is null then a
              when public.season_start_year(a) <= public.season_start_year(b) then a
              else b end
$function$
;
