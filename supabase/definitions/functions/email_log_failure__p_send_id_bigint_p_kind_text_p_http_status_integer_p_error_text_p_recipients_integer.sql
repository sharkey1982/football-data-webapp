-- Live definition exported from the database (function email_log_failure(p_send_id bigint, p_kind text, p_http_status integer, p_error text, p_recipients integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_log_failure(p_send_id bigint, p_kind text, p_http_status integer, p_error text, p_recipients integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into private.email_failures (send_id, kind, http_status, error, recipients)
  values (p_send_id, p_kind, p_http_status,
          left(regexp_replace(coalesce(p_error, ''), '[^\s<>"'',;:]+@[^\s<>"'',;:]+', '[address]', 'g'), 500),
          greatest(coalesce(p_recipients, 1), 0));
$function$
;
