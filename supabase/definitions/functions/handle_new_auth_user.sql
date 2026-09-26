-- Live definition exported from the database (function handle_new_auth_user()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_is_admin boolean;
begin
  -- Case-insensitive: email providers treat the local part as
  -- case-insensitive in practice, and a capitalised sign-in silently
  -- failing to match would be a confusing way to lose admin.
  select exists (
    select 1 from public.admin_bootstrap_emails
    where lower(email) = lower(new.email)
  ) into v_is_admin;

  insert into public.app_users (user_id, email, is_admin)
  values (new.id, new.email, coalesce(v_is_admin, false))
  on conflict (user_id) do update
    set email = excluded.email,
        is_admin = public.app_users.is_admin or excluded.is_admin;

  return new;
end;
$function$
;
