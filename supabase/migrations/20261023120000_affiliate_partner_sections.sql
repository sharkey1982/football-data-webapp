-- Affiliate partners apply per site section (Chris, 23 Oct 2026).
--
-- Until now a partner applied wherever its domain matched a watch link. 16
-- football broadcasts link to dazn.com, so activating DAZN for the NFL
-- trial would also have put affiliate links on Club pages. A partner now
-- applies only in the sections listed here; empty means nowhere.
--
-- Sections: club, fpl, nfl, tennis, intl (src/lib/commercialLinks.ts,
-- AffiliateSection).
--
-- DAZN UK (joined on Awin) is scoped to the NFL section and stays inactive:
-- it goes live in a follow-up migration that sets affiliate_url_template
-- from the real Awin link and active = true. Safe to re-run.

alter table public.affiliate_partners
  add column if not exists sections text[] not null default '{}';

alter table public.affiliate_partners
  drop constraint if exists affiliate_partners_sections_check;

alter table public.affiliate_partners
  add constraint affiliate_partners_sections_check
  check (sections <@ array['club','fpl','nfl','tennis','intl']::text[]);

update public.affiliate_partners
set sections = array['nfl'],
    notes = 'Joined on Awin (Oct 2026). NFL section only (Game Pass watch links). Not on Club/FPL pages. Game Pass Sunday 18:00/21:25 blackout games carry no link (src/lib/nflWatch.ts).',
    updated_at = now()
where canonical_domain = 'dazn.com' and market = 'GB' and sections <> array['nfl'];

comment on column public.affiliate_partners.sections is
  'Site sections where this partner''s links apply (club, fpl, nfl, tennis, intl). Empty = nowhere.';
