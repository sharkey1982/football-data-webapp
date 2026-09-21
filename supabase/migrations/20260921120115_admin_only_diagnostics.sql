-- ============================================================================
-- Admin-only diagnostic functions (audit 2026-09-21, findings 2 and 4).
--
-- Three SECURITY DEFINER diagnostics were callable more widely than intended:
--   get_public_read_audit()       ANY anonymous visitor -- returned a full map
--                                 of every table/view and which are private:
--                                 a ready-made guide for anyone probing.
--   get_data_integrity_report()   ANY anonymous visitor -- internal pipeline
--                                 health and names of misconfigured objects.
--   check_auth_user_token_nulls() ANY signed-in user -- a count read from
--                                 auth.users.
-- Only the admin-only Data Health page uses the first two (src/lib/healthApi.ts);
-- nothing in the database, cron or CI calls any of them.
--
-- Approach: each original is RENAMED to a private _impl (no grants at all) and
-- a same-named wrapper checks the caller before delegating. The original logic
-- is untouched, not copied, so it cannot drift. The wrappers admit admins
-- (public.is_admin()) and the service role, so a future server job is not
-- locked out; anyone else gets SQLSTATE 42501 (insufficient_privilege).
-- EXECUTE on the wrappers: authenticated only (the admin signs in); anon none.
-- ============================================================================

create or replace function public._require_admin()
returns void
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._require_admin() from public, anon;
grant execute on function public._require_admin() to authenticated, service_role;

-- 1. get_public_read_audit
alter function public.get_public_read_audit() rename to _get_public_read_audit_impl;
revoke all on function public._get_public_read_audit_impl() from public, anon, authenticated;

create function public.get_public_read_audit()
returns table(object_name text, object_kind text, rls_enabled boolean, has_select_policy boolean, anon_has_select_grant boolean, anon_can_read boolean)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public._require_admin();
  return query select * from public._get_public_read_audit_impl();
end;
$$;
revoke all on function public.get_public_read_audit() from public, anon;
grant execute on function public.get_public_read_audit() to authenticated, service_role;

-- 2. get_data_integrity_report (its body calls get_public_read_audit, which
--    now re-checks the same caller -- harmless for an admin)
alter function public.get_data_integrity_report() rename to _get_data_integrity_report_impl;
revoke all on function public._get_data_integrity_report_impl() from public, anon, authenticated;

create function public.get_data_integrity_report()
returns table(check_name text, status text, detail text)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public._require_admin();
  return query select * from public._get_data_integrity_report_impl();
end;
$$;
revoke all on function public.get_data_integrity_report() from public, anon;
grant execute on function public.get_data_integrity_report() to authenticated, service_role;

-- 3. check_auth_user_token_nulls
alter function public.check_auth_user_token_nulls() rename to _check_auth_user_token_nulls_impl;
revoke all on function public._check_auth_user_token_nulls_impl() from public, anon, authenticated;

create function public.check_auth_user_token_nulls()
returns table(bad_rows integer)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public._require_admin();
  return query select * from public._check_auth_user_token_nulls_impl();
end;
$$;
revoke all on function public.check_auth_user_token_nulls() from public, anon;
grant execute on function public.check_auth_user_token_nulls() to authenticated, service_role;
