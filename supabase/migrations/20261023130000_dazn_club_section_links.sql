-- DAZN affiliate links on Club pages too (Chris, 23 Oct 2026), each section
-- with its own Awin link.
--
-- 1. affiliate_partners.section_url_templates: a section's own link, used in
--    place of affiliate_url_template there (src/lib/commercialLinks.ts).
-- 2. DAZN UK: the general Awin link (no campaign) for Club pages; the NFL keeps
--    the "NFL Game Pass on DAZN" campaign link so NFL clicks report
--    separately in Awin. Sections: nfl and club (TV guide, match pages,
--    fixtures). Not FPL, tennis or international.
-- 3. Upcoming DAZN listings had no watch link (the Serie A rows came from
--    Airtable without one), so they showed no "Watch" link at all. They get
--    DAZN's UK home page. ingest_broadcasts keeps a stored watch_url when a
--    later research row leaves it out, and docs/broadcast-research.md now asks
--    for it on DAZN rows.
-- Safe to re-run.

alter table public.affiliate_partners
  add column if not exists section_url_templates jsonb not null default '{}'::jsonb;

comment on column public.affiliate_partners.section_url_templates is
  'Per-section affiliate link templates ({"nfl": "...{url}"}), used instead of affiliate_url_template in that section.';

update public.affiliate_partners
set affiliate_url_template = 'https://www.awin1.com/cread.php?awinmid=126251&awinaffid=3107171&ued={url}',
    section_url_templates = jsonb_build_object('nfl', 'https://www.awin1.com/cread.php?awinmid=126251&awinaffid=3107171&campaign=NFL+Game+Pass+on+DAZN&ued={url}'),
    sections = array['club', 'nfl'],
    notes = 'Joined on Awin (Oct 2026). Club pages (general link) and NFL (NFL Game Pass campaign link). Game Pass Sunday 18:00/21:25 blackout games carry no link (src/lib/nflWatch.ts).',
    last_verified = date '2026-10-23',
    updated_at = now()
where canonical_domain = 'dazn.com'
  and market = 'GB'
  and (sections is distinct from array['club', 'nfl']
       or affiliate_url_template is distinct from 'https://www.awin1.com/cread.php?awinmid=126251&awinaffid=3107171&ued={url}');

update public.fixture_broadcasts b
set watch_url = 'https://www.dazn.com/en-GB',
    updated_at = now()
from public.fixtures f
where f.fixture_id = b.fixture_id
  and f.kickoff_date >= date '2026-10-23'
  and b.status = 'confirmed_broadcast'
  and b.market = 'GB'
  and b.watch_url is null
  and concat_ws(' ', b.broadcaster, b.channel, b.streaming_service, b.service_product) ~* '\mdazn\M';
