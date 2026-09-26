-- Live definition exported from the database (function check_auth_user_token_nulls()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_auth_user_token_nulls()
 RETURNS TABLE(bad_rows integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  perform public._require_admin();
  return query select * from public._check_auth_user_token_nulls_impl();
end;
$function$
;
