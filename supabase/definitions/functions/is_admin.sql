-- Live definition exported from the database (function is_admin()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select exists (
    select 1 from public.app_users
    where user_id = auth.uid() and is_admin
  );
$function$
;
