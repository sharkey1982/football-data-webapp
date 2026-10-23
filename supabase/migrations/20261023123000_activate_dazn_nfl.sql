-- Switch on DAZN UK (Awin) for the NFL section (Chris, 23 Oct 2026).
--
-- Link from Awin's link builder: publisher 3107171, advertiser 126251,
-- campaign "NFL Game Pass on DAZN". {url} replaces the fixed destination so
-- the resolver can deep-link any dazn.com page (src/lib/commercialLinks.ts).
-- Scoped to sections = {nfl} by 20261023120000; football pages that link to
-- dazn.com keep plain links. Safe to re-run.

update public.affiliate_partners
set affiliate_url_template = 'https://www.awin1.com/cread.php?awinmid=126251&awinaffid=3107171&campaign=NFL+Game+Pass+on+DAZN&ued={url}',
    active = true,
    valid_from = coalesce(valid_from, date '2026-10-23'),
    last_verified = date '2026-10-23',
    updated_at = now()
where canonical_domain = 'dazn.com'
  and market = 'GB'
  and sections = array['nfl']
  and (active is distinct from true or affiliate_url_template is distinct from
       'https://www.awin1.com/cread.php?awinmid=126251&awinaffid=3107171&campaign=NFL+Game+Pass+on+DAZN&ued={url}');
