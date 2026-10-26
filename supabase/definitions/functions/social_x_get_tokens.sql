-- Live definition exported from the database (function social_x_get_tokens()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_x_get_tokens()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('status', x.status, 'x_username', x.x_username, 'token_version', x.token_version,
                            'access_expires_at', x.access_expires_at)
         || coalesce((select d.decrypted_secret::jsonb from vault.decrypted_secrets d where d.id = x.vault_secret_id), '{}')
    from public.social_x_connection x;
$function$
;
