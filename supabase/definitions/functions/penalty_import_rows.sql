-- Live definition exported from the database (function penalty_import_rows()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.penalty_import_rows()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*) from public.espn_pl_matches where match_date >= date '2026-08-01'
$function$
;
