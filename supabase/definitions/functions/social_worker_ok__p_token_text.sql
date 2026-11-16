-- Live definition exported from the database (function social_worker_ok(p_token text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_worker_ok(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_token, '') <> '' and p_token = (select token from private.social_worker);
$function$
;
