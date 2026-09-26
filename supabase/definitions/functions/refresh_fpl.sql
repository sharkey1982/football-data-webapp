-- Live definition exported from the database (function refresh_fpl()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
  -- Wrapper only. The body lives in private.refresh_fpl(), which is what
  -- pg_cron runs. Two independent copies diverged silently once and took
  -- the pipeline down for half a day; never let that happen again.
  select private.refresh_fpl();
$function$
;
