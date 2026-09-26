-- Live definition exported from the database (function get_public_read_audit()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_public_read_audit()
 RETURNS TABLE(object_name text, object_kind text, rls_enabled boolean, has_select_policy boolean, anon_has_select_grant boolean, anon_can_read boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  perform public._require_admin();
  return query select * from public._get_public_read_audit_impl();
end;
$function$
;
