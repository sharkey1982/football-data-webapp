-- ============================================================================
-- Catalogue entry for get_country_league_summary() after
-- 20260927140600_country_summary_cards_only_with_stats.sql. Run after
-- select public.meta_refresh_flow().
-- ============================================================================

update public.meta_flow_nodes set
  purpose = replace(purpose,
    'Caveat: card averages exclude matches from ''/new/'' source files (no card data).',
    'Caveat: card averages use only matches that carry match stats (home_shots not null) and not from ''/new/'' source files; a league-season without stats (e.g. 2016/17 Belgium, Greece, Netherlands, Portugal, Turkey; England before 2000/01) returns null, not 0.'),
  purpose_reviewed_at = now()
where node_key = 'function:get_country_league_summary()';
