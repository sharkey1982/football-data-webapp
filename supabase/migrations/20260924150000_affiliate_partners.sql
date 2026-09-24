-- Generic, reusable affiliate-link config -- not TV-specific, so tickets,
-- merchandise, travel etc. reuse this same table later without a new
-- migration. Deliberately small and rarely-touched (a handful of rows,
-- edited when a programme is joined or a tracking ID changes), unlike
-- fixture_broadcasts (hundreds of rows a season) -- so this is a plain
-- admin-write table, not an Airtable-fed pipeline.
--
-- The resolver (src/lib/commercialLinks.ts) matches a fixture's canonical
-- watch_url against canonical_domain to find an active, in-window partner
-- row, then builds the affiliate URL from affiliate_url_template (which
-- contains a {url} placeholder for the URL-encoded canonical destination --
-- the standard shape for Awin/most network deep links). No template, not
-- active, or outside [valid_from, valid_to] -> the canonical URL is
-- returned unchanged. Tracking IDs embedded in affiliate_url_template are
-- NOT secrets -- that's how affiliate links work, the ID rides in the
-- public URL the visitor clicks -- so this is public-readable by design,
-- same as fixture_broadcasts.
create table public.affiliate_partners (
  partner_id bigserial primary key,
  name text not null,
  category text not null check (category in ('streaming','tickets','merchandise','travel','stadium_experiences')),
  network text,
  canonical_domain text not null,
  affiliate_url_template text,
  market text not null default 'GB',
  active boolean not null default false,
  valid_from date,
  valid_to date,
  last_verified date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_domain, market)
);

alter table public.affiliate_partners enable row level security;

create policy "affiliate_partners readable by anyone"
  on public.affiliate_partners for select
  using (true);

create policy "affiliate_partners writable by admins"
  on public.affiliate_partners for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.affiliate_partners to anon, authenticated;
grant all on public.affiliate_partners to service_role;
grant usage, select on sequence public.affiliate_partners_partner_id_seq to service_role;

-- Placeholder rows for the programmes actually under consideration (see
-- the earlier conversation) -- name, category and which destination
-- domain they'd apply to, all inactive with no template. Nothing here is
-- a real affiliate ID or URL; that's added later, only once each
-- programme is actually joined.
insert into public.affiliate_partners (name, category, network, canonical_domain, active, notes) values
('NOW', 'streaming', 'Awin', 'nowtv.com', false, 'Sky sport streaming. Apply via Awin once the site is on its real domain.'),
('Sky', 'streaming', 'Awin', 'sky.com', false, 'Sky controls which offers affiliates may promote; no self-built deep links.'),
('DAZN UK', 'streaming', 'Awin', 'dazn.com', false, '45-day attribution per DAZN''s published Awin terms as of this research.'),
('Amazon Prime Video', 'streaming', 'Amazon Associates', 'amazon.co.uk', false, 'Separate signup from Awin (Amazon Associates UK), not via Awin.');

comment on table public.affiliate_partners is
  'Generic affiliate-link config (streaming/tickets/merchandise/travel/stadium_experiences). Small, admin-maintained, public-readable -- see src/lib/commercialLinks.ts for the resolver that reads it.';

-- Official club website, kept separate from any affiliate concept --
-- clubs don't run affiliate programmes for their own site traffic, this
-- is just a fact about the club. Nullable, unpopulated for now: no URL
-- is invented for any club, same principle as the affiliate rows above.
alter table public.teams add column official_website_url text;
