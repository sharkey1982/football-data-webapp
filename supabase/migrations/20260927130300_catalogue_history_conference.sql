-- ============================================================================
-- Catalogue entries for the Conference (tier 5) 2004/05-2013/14 history load
-- (docs/history-backfill.md). Idempotent.
-- ============================================================================

update public.meta_flow_nodes set
  purpose = 'Scratch staging for the English history load (tiers 1-4 1992/93-2013/14, tier 5 2004/05-2013/14): one row per match row in each source file -- football-data.co.uk E0-E3 1993/94-2013/14 and EC 2005/06-2013/14, engsoccerdata england.csv tiers 1-4 1992-2013 and england_nonleague.csv tier 5 2004-2013 -- with date, names, full-time and half-time score and whether stats/odds were present. Used to map club names by aligning the two sources and to cross-check every imported result. Not read by the site or the model; drop once the load is signed off.',
  purpose_reviewed_at = now()
where node_key = 'object:historic_source_rows' and purpose not like '%tier 5%';

update public.meta_flow_nodes set
  refresh_note = refresh_note || ' The Conference (EC) 2004/05-2013/14 was loaded the same way: 2005/06 on from football-data.co.uk, 2004/05 from engsoccerdata england_nonleague.csv (full-time scores only); Chester City''s expunged 2009/10 record is not in either source.',
  purpose_reviewed_at = now()
where node_key = 'object:matches' and refresh_note not like '%Conference (EC) 2004/05%';
