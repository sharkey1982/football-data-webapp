-- ============================================================================
-- Catalogue entries for the 1992/93-2013/14 history load
-- (docs/history-backfill.md). Run after select public.meta_refresh_flow().
-- ============================================================================

update public.meta_flow_nodes set
  layer = 'scratch', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Scratch staging for the English history load (tiers 1-4, 1992/93-2013/14): one row per match row in each source file -- football-data.co.uk E0-E3 1993/94-2013/14 and engsoccerdata england.csv tiers 1-4 1992-2013 -- with date, names, full-time and half-time score and whether stats/odds were present. Used to map club names by aligning the two sources and to cross-check every imported result. Not read by the site or the model; drop once the load is signed off.',
  refresh_note = 'Written by scripts/history_backfill.py stage (manual workflow history-backfill.yml); each file''s rows are replaced on re-run. One-off.',
  purpose_reviewed_at = now()
where node_key = 'object:historic_source_rows';

update public.meta_flow_nodes set
  refresh_note = refresh_note || ' English tiers 1-4 1992/93-2013/14 were loaded once by scripts/history_backfill.py (manual workflow history-backfill.yml): 1993/94 on from football-data.co.uk, 1992/93 from engsoccerdata (source_name ''engsoccerdata'', full-time scores only). Pre-2000/01 rows have no stats; cards are 0 there because the columns are NOT NULL, not because none were shown -- see docs/history-backfill.md.',
  purpose_reviewed_at = now()
where node_key = 'object:matches' and refresh_note not like '%history_backfill.py%';

update public.meta_flow_nodes set
  refresh_note = refresh_note || ' Also one row per file from the one-off history load (scripts/history_backfill.py; error_message starts ''history <label>'').',
  purpose_reviewed_at = now()
where node_key = 'object:match_import_runs' and refresh_note not like '%history_backfill.py%';

update public.meta_flow_nodes set
  purpose = purpose || ' Source ''engsoccerdata'' holds the engsoccerdata spellings used for the 1992/93 load. football-data.co.uk spells two pairs of clubs the same ("Halifax", "Chester"): the aliases point at the current clubs and the history importer sends pre-2008/pre-2010 rows to Halifax Town / Chester City.',
  purpose_reviewed_at = now()
where node_key = 'object:team_aliases' and purpose not like '%engsoccerdata%';
