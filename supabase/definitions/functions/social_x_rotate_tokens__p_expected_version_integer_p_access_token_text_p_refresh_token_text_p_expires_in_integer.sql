-- Live definition exported from the database (function social_x_rotate_tokens(p_expected_version integer, p_access_token text, p_refresh_token text, p_expires_in integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_x_rotate_tokens(p_expected_version integer, p_access_token text, p_refresh_token text, p_expires_in integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare x public.social_x_connection;
begin
  select * into x from public.social_x_connection for update;
  if x.status <> 'connected' or x.token_version <> p_expected_version or x.vault_secret_id is null then return false; end if;
  perform vault.update_secret(x.vault_secret_id, jsonb_build_object('access_token', p_access_token, 'refresh_token', p_refresh_token)::text);
  update public.social_x_connection set token_version = token_version + 1, access_expires_at = now() + make_interval(secs => p_expires_in),
         last_refreshed_at = now(), last_error = null, updated_at = now() where id;
  perform private.social_audit('x_token_refreshed', null, null, jsonb_build_object('token_version', x.token_version + 1));
  return true;
end;
$function$
;
