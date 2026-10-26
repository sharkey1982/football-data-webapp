-- Live definition exported from the database (function intl_match_keys(p_year integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intl_match_keys(p_year integer)
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select match_key from intl.matches where extract(year from match_date) = p_year
$function$
;
