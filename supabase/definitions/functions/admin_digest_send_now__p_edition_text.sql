-- Live definition exported from the database (function admin_digest_send_now(p_edition text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.admin_digest_send_now(p_edition text DEFAULT 'evening'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return private.admin_digest_send((now() at time zone 'Europe/London')::date, 'preview', p_edition);
end;
$function$
;
