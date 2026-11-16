-- Live definition exported from the database (function email_admin_send_test(p_fpl_id bigint, p_club bigint, p_watch integer[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_admin_send_test(p_fpl_id bigint DEFAULT NULL::bigint, p_club bigint DEFAULT NULL::bigint, p_watch integer[] DEFAULT '{}'::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  perform private.email_invoke(jsonb_build_object('mode', 'test', 'fpl_id', p_fpl_id, 'club_id', p_club, 'watchlist', to_jsonb(coalesce(p_watch, '{}'))));
  return jsonb_build_object('ok', true);
end;
$function$
;
