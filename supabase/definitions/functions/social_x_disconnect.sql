-- Live definition exported from the database (function social_x_disconnect()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_x_disconnect()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select vault_secret_id into v_sid from public.social_x_connection;
  if v_sid is not null then delete from vault.secrets where id = v_sid; end if;
  update public.social_x_connection set status = 'disconnected', vault_secret_id = null, access_expires_at = null,
         token_version = token_version + 1, updated_at = now() where id;
  perform private.social_audit('x_disconnected', null, auth.uid(), '{}');
  return jsonb_build_object('ok', true);
end;
$function$
;
