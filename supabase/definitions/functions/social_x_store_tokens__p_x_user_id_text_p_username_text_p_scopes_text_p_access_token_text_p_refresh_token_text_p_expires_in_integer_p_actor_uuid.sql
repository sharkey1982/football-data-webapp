-- Live definition exported from the database (function social_x_store_tokens(p_x_user_id text, p_username text, p_scopes text, p_access_token text, p_refresh_token text, p_expires_in integer, p_actor uuid)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_x_store_tokens(p_x_user_id text, p_username text, p_scopes text, p_access_token text, p_refresh_token text, p_expires_in integer, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s public.social_settings; v_sid uuid; v_secret text; v_scopes text[]; v_missing text[]; v_extra text[];
begin
  select * into s from public.social_settings for update;
  if lower(coalesce(p_username, '')) <> lower(s.allowed_x_username)
     or (s.allowed_x_user_id is not null and p_x_user_id is distinct from s.allowed_x_user_id) then
    perform private.social_audit('x_connect_rejected', null, p_actor,
                                 jsonb_build_object('reason', 'wrong account', 'username', p_username, 'x_user_id', p_x_user_id));
    return jsonb_build_object('ok', false, 'reason', 'wrong_account');
  end if;
  v_scopes := string_to_array(btrim(coalesce(p_scopes, '')), ' ');
  select array_agg(x) into v_missing from unnest(array['tweet.read', 'tweet.write', 'users.read', 'offline.access']) x where not (x = any(v_scopes));
  select array_agg(x) into v_extra from unnest(v_scopes) x where x not in ('tweet.read', 'tweet.write', 'users.read', 'offline.access');
  if v_missing is not null or v_extra is not null or coalesce(p_refresh_token, '') = '' then
    perform private.social_audit('x_connect_rejected', null, p_actor,
                                 jsonb_build_object('reason', 'scopes', 'missing', v_missing, 'unexpected', v_extra));
    return jsonb_build_object('ok', false, 'reason', 'scopes');
  end if;

  v_secret := jsonb_build_object('access_token', p_access_token, 'refresh_token', p_refresh_token)::text;
  select id into v_sid from vault.secrets where name = 'x_oauth_fixturesharkhq';
  if v_sid is null then
    v_sid := vault.create_secret(v_secret, 'x_oauth_fixturesharkhq', 'X OAuth 2.0 user tokens for @FixtureSharkHQ (social publishing)');
  else
    perform vault.update_secret(v_sid, v_secret);
  end if;

  update public.social_x_connection set status = 'connected', x_user_id = p_x_user_id, x_username = p_username, scopes = p_scopes,
         connected_at = now(), connected_by = p_actor, access_expires_at = now() + make_interval(secs => p_expires_in),
         last_refreshed_at = now(), token_version = token_version + 1, vault_secret_id = v_sid, last_error = null, updated_at = now() where id;
  update public.social_settings set allowed_x_user_id = coalesce(allowed_x_user_id, p_x_user_id) where id;
  perform private.social_audit('x_connected', null, p_actor, jsonb_build_object('username', p_username, 'x_user_id', p_x_user_id, 'scopes', p_scopes));
  return jsonb_build_object('ok', true);
end;
$function$
;
