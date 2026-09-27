-- ============================================================================
-- Catalogue entries after 20260927160000_comparison_pages_era_names_and_cards
-- .sql. Run after select public.meta_refresh_flow(). Idempotent.
-- ============================================================================

update public.meta_flow_nodes set
  purpose = replace(purpose, 'Feeds the Countries Compared page.', 'league_name is the division''s name in that season (league_name_for_season). Feeds the Countries Compared page, which also pools seasons client-side for its multi-season periods.'),
  purpose_reviewed_at = now()
where node_key = 'function:get_country_league_summary()' and purpose not like '%league_name_for_season%';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'yellows and reds per game,', 'yellows and reds per game (null for a division-season in which no match has a card, i.e. no card data: England before 2000/01, National League 2004/05),'),
  purpose_reviewed_at = now()
where node_key = 'function:get_cross_league_summary()' and purpose not like '%no card data%';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'league_name is today''s name for every season.', 'league_name is the division''s name in that season (league_name_for_season), e.g. First Division for E1 before 2004/05.'),
  purpose_reviewed_at = now()
where node_key = 'function:get_cross_league_summary()';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'Used by /football/market-efficiency.', 'league_name is the division''s name(s) over the pooled seasons, oldest first, joined by '' / '' (league_name_for_season). Used by /football/market-efficiency.'),
  purpose_reviewed_at = now()
where node_key = 'function:get_market_efficiency(p_bookmaker text, p_closing boolean)' and purpose not like '%league_name_for_season%';
