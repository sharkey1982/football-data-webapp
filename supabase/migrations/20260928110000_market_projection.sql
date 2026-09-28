-- ============================================================================
-- Projected final table from market ratings (Model Lab F4 passed, 28 Sep
-- 2026), kept beside the Dixon-Coles projection.
--
-- market_closing_lines: per played match, the Avg closing 1X2 de-vigged
-- (basic, the F0 method) and the Avg closing over/under 2.5 de-vigged. Read
-- straight from match_odds (lab_market_probs is a lab snapshot, refreshed by
-- hand). Internal: service role only.
--
-- team_finishing_position_projection gains method ('dixon_coles' |
-- 'market'); existing rows are Dixon-Coles. The key becomes
-- (league_id, season_id, team_id, method). simulate_final_table.py writes
-- both from this release; the site reads both (market as the headline
-- projection, Dixon-Coles as "Model").
-- ============================================================================

create view public.market_closing_lines with (security_invoker = true) as
select m.match_id, m.league_id, m.season_id, m.match_date, m.home_team_id, m.away_team_id,
  (1 / x.price_home) / (1 / x.price_home + 1 / x.price_draw + 1 / x.price_away) as p_home,
  (1 / x.price_draw) / (1 / x.price_home + 1 / x.price_draw + 1 / x.price_away) as p_draw,
  (1 / x.price_away) / (1 / x.price_home + 1 / x.price_draw + 1 / x.price_away) as p_away,
  (1 / ou.price_over) / (1 / ou.price_over + 1 / ou.price_under) as p_over
from public.matches m
join public.match_odds x on x.match_id = m.match_id and x.market = '1x2' and x.bookmaker = 'Avg' and x.is_closing
  and x.price_home > 1 and x.price_draw > 1 and x.price_away > 1
join public.match_odds ou on ou.match_id = m.match_id and ou.market = 'ou25' and ou.bookmaker = 'Avg' and ou.is_closing
  and ou.price_over > 1 and ou.price_under > 1
where m.full_time_home_goals is not null;

revoke all on public.market_closing_lines from anon, authenticated;
grant select on public.market_closing_lines to service_role;

alter table public.team_finishing_position_projection
  add column method text not null default 'dixon_coles'
  constraint team_finishing_position_projection_method_check check (method in ('dixon_coles', 'market'));

alter table public.team_finishing_position_projection drop constraint team_finishing_position_projection_pkey;
alter table public.team_finishing_position_projection add primary key (league_id, season_id, team_id, method);

comment on column public.team_finishing_position_projection.method is
  'dixon_coles: remaining fixtures simulated from fixtures.predicted_*_goals (the site''s model). market: from team ratings read off closing market prices (scripts/market_ratings.py; Model Lab F4).';

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = true,
  purpose = 'Played matches with the Avg closing 1X2 and over/under 2.5 prices de-vigged (basic). Input to the market-rating projection of the final table (simulate_final_table.py via scripts/market_ratings.py).',
  refresh_note = 'View over matches and match_odds.', purpose_reviewed_at = now()
where node_key = 'object:market_closing_lines';

update public.meta_flow_nodes set purpose_reviewed_at = now(),
  purpose = 'Projected final league position and points per team from 20,000 simulations of the remaining season, two ways (method): market (ratings read off closing market prices -- the headline on Team Strength since Model Lab F4 passed) and dixon_coles (the site''s model, shown beside it). Written by scripts/simulate_final_table.py twice daily.'
where node_key = 'object:team_finishing_position_projection';
