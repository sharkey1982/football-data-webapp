-- Live definition exported from the database (function cf_import_state()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.cf_import_state()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('days', count(*), 'first', min(date), 'last', max(date)) from cf.daily_totals
$function$
;
