-- Live definition exported from the database (function get_data_integrity_report()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_data_integrity_report()
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  perform public._require_admin();
  return query select * from public._get_data_integrity_report_impl();
end;
$function$
;
