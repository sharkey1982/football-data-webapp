-- UK (and future other-market) broadcast information per fixture. Applied
-- 2026-09-24, after investigating realistic sources: no free,
-- terms-compliant, automated per-fixture feed exists (commercial APIs like
-- Sportmonks carry a tvStations field but cost money on an ongoing basis;
-- well-known free listings sites explicitly forbid scraping/republishing).
-- Written by an admin (is_admin(), same pattern as
-- team_strength_manual_override) until/unless a paid feed is chosen.
--
-- Normalized: a fixture can have zero, one or many rows. No columns on
-- fixtures itself. Three states, cleanly distinguished:
--   no row at all                                         -> not yet determined
--   one row, status='confirmed_not_televised'             -> definitely not on
--   one or more rows, status='confirmed_broadcast'        -> here's where to watch
-- At most one confirmed_not_televised row per fixture+market (there's only
-- one way to be "not on"); any number of confirmed_broadcast rows (linear
-- TV and a streaming service are often two separate rows).
create table public.fixture_broadcasts (
  broadcast_id bigint generated always as identity primary key,
  fixture_id bigint not null references public.fixtures(fixture_id) on delete cascade,
  market text not null default 'GB',  -- ISO 3166-1 alpha-2; not restricted to GB
  status text not null check (status in ('confirmed_broadcast', 'confirmed_not_televised')),
  broadcaster text,
  channel text,
  streaming_service text,
  is_free_to_air boolean not null default false,
  is_subscription boolean not null default false,
  is_ppv boolean not null default false,
  watch_url text,
  source text not null,
  source_url text,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixture_broadcasts_status_shape check (
    (status = 'confirmed_not_televised' and broadcaster is null and channel is null and streaming_service is null
       and not is_free_to_air and not is_subscription and not is_ppv and watch_url is null)
    or (status = 'confirmed_broadcast' and broadcaster is not null)
  )
);
create index fixture_broadcasts_fixture_idx on public.fixture_broadcasts (fixture_id, market);
create unique index fixture_broadcasts_one_not_televised on public.fixture_broadcasts (fixture_id, market)
  where status = 'confirmed_not_televised';

alter table public.fixture_broadcasts enable row level security;
create policy "fixture_broadcasts public read" on public.fixture_broadcasts for select using (true);
create policy "fixture_broadcasts admin write" on public.fixture_broadcasts for all using (is_admin()) with check (is_admin());
grant select on public.fixture_broadcasts to anon;
grant select, insert, update, delete on public.fixture_broadcasts to authenticated;
grant select, insert, update, delete on public.fixture_broadcasts to service_role;
