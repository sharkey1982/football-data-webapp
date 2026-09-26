-- Live definition exported from the database (function _check_auth_user_token_nulls_impl()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public._check_auth_user_token_nulls_impl()
 RETURNS TABLE(bad_rows integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
  select count(*)::int from auth.users
  where confirmation_token is null or recovery_token is null
     or email_change_token_new is null or email_change is null
     or email_change_token_current is null or phone_change is null
     or phone_change_token is null or reauthentication_token is null;
$function$
;
