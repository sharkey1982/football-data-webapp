-- Live definition exported from the database (function social_x_mark_error(p_error text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_x_mark_error(p_error text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.social_x_connection set status = 'error', last_error = left(p_error, 500), updated_at = now() where id;
  perform private.social_audit('x_connection_error', null, null, jsonb_build_object('error', left(p_error, 500)));
end;
$function$
;
