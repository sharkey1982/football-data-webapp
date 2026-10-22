-- ============================================================================
-- Credential expiry tracking (audit SEC-13, 22 Oct 2026). Safe to re-run.
--
-- The Anthropic key used by ai-lab-run expires (30-day keys) and nothing
-- said so until a run failed with 401. public.credential_expiries records
-- each expiring credential (name and where it lives, never the value);
-- public.check_credentials() (integrity area "credentials") warns 7 days
-- before expires_on, fails once it has passed, and warns while a date is
-- unknown. It also reports the X connection (social_x_connection).
--
-- When you replace a key, record its new date in a migration:
--   update public.credential_expiries set expires_on = '<date>', updated_at = now()
--    where credential = 'ANTHROPIC_API_KEY';
-- ============================================================================
create table if not exists public.credential_expiries (
  credential text primary key,
  location text not null,
  expires_on date,
  used_by text,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.credential_expiries enable row level security;
revoke all on public.credential_expiries from anon, authenticated;
comment on table public.credential_expiries is
  'Expiring credentials (name and location only, never values); checked by check_credentials() (audit SEC-13)';

insert into public.credential_expiries (credential, location, expires_on, used_by, note) values
  ('ANTHROPIC_API_KEY', 'Supabase Edge Function secrets', null, 'ai-lab-run (AI Lab, batch queue)',
   '30-day key; expiry date not recorded yet (22 Oct 2026). Set expires_on when the key is next replaced.'),
  ('ANTHROPIC_EVAL_API_KEY', 'GitHub Actions secret', null, 'fpl-evals workflow',
   'Expiry not recorded yet (22 Oct 2026).')
on conflict (credential) do nothing;

create or replace function public.check_credentials()
returns table (check_name text, status text, found bigint, detail text)
language sql stable
security definer
set search_path = ''
as $$
  select 'credential_expiry_' || lower(c.credential),
         case when c.expires_on is null then 'warning'
              when c.expires_on < current_date then 'failed'
              when c.expires_on <= current_date + 7 then 'warning'
              else 'ok' end,
         coalesce((c.expires_on - current_date)::bigint, -1),
         case when c.expires_on is null
              then format('%s (%s, used by %s): expiry date unknown; record it in public.credential_expiries', c.credential, c.location, c.used_by)
              else format('Days until %s (%s, used by %s) expires on %s; warns 7 days ahead', c.credential, c.location, c.used_by, c.expires_on) end
    from public.credential_expiries c
  union all
  select 'x_connection',
         case when x.status is distinct from 'connected' or x.last_error is not null then 'warning' else 'ok' end,
         case when x.status is distinct from 'connected' or x.last_error is not null then 1 else 0 end,
         format('X account %s: status %s%s', coalesce('@' || x.x_username, '(none)'), coalesce(x.status, 'missing'),
                coalesce('; last error: ' || left(x.last_error, 200), ''))
    from (select 1) one
    left join lateral (select * from public.social_x_connection order by updated_at desc nulls last limit 1) x on true
$$;
revoke all on function public.check_credentials() from public, anon, authenticated;
grant execute on function public.check_credentials() to service_role;
