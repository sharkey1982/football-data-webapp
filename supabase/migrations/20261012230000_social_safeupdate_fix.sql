-- ============================================================================
-- Social publishing fix: Supabase's API connections load safeupdate, which
-- rejects any UPDATE without a WHERE clause. The one-row tables
-- (social_settings, social_x_connection) were updated without one, so
-- saving the X connection failed ("Could not save the connection", 12 Oct)
-- and the settings toggles would have failed too. Same functions, each
-- update now says `where id` (the one-row key, always true).
-- ============================================================================
create or replace function public.social_update_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; k text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('kill_switch', 'live_enabled', 'detector_enabled', 'max_posts_per_day', 'max_posts_per_month',
                 'min_minutes_between_posts', 'monthly_budget_usd', 'allow_urls', 'auto_publish_enabled') then
      raise exception 'setting % cannot be changed here', k;
    end if;
  end loop;
  if coalesce((p->>'auto_publish_enabled')::boolean, false) then
    raise exception 'automatic publishing is not available yet (Phase 4 needs its own reviewed change)';
  end if;
  select to_jsonb(s) into v_before from public.social_settings s;
  update public.social_settings set
    kill_switch = coalesce((p->>'kill_switch')::boolean, kill_switch),
    live_enabled = coalesce((p->>'live_enabled')::boolean, live_enabled),
    detector_enabled = coalesce((p->>'detector_enabled')::boolean, detector_enabled),
    max_posts_per_day = coalesce((p->>'max_posts_per_day')::int, max_posts_per_day),
    max_posts_per_month = coalesce((p->>'max_posts_per_month')::int, max_posts_per_month),
    min_minutes_between_posts = coalesce((p->>'min_minutes_between_posts')::int, min_minutes_between_posts),
    monthly_budget_usd = coalesce((p->>'monthly_budget_usd')::numeric, monthly_budget_usd),
    allow_urls = coalesce((p->>'allow_urls')::boolean, allow_urls),
    updated_at = now(), updated_by = auth.uid()
  where id;
  perform private.social_audit('settings', null, auth.uid(), jsonb_build_object('before', v_before, 'change', p));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.social_x_store_tokens(p_x_user_id text, p_username text, p_scopes text, p_access_token text,
                                                        p_refresh_token text, p_expires_in integer, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;

create or replace function public.social_x_rotate_tokens(p_expected_version integer, p_access_token text, p_refresh_token text, p_expires_in integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;

create or replace function public.social_x_mark_error(p_error text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.social_x_connection set status = 'error', last_error = left(p_error, 500), updated_at = now() where id;
  perform private.social_audit('x_connection_error', null, null, jsonb_build_object('error', left(p_error, 500)));
end;
$$;

create or replace function public.social_x_disconnect()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;
