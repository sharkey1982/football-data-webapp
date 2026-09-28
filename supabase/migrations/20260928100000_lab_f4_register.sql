-- ============================================================================
-- Model Lab F4: market-implied team ratings for the projected final table.
-- Registered before any result was computed.
--
-- Why: the Team Strength table's projected finish comes from Dixon-Coles
-- ratings (results only). The market disagrees with it on several clubs
-- (28 Sep 2026: Tottenham by ~0.4 expected points a game), and F1 showed
-- Dixon-Coles adds nothing to the market for single matches. F4 asks whether
-- ratings read off market prices project final tables better.
--
-- lab_f4_lines: one row per E0-E3 match from 2019/20 with the result and the
-- Avg closing 1X2 and over/under 2.5 prices, de-vigged by the F0 method
-- (basic). Private (service role only); read by scripts/lab_f4.py.
-- ============================================================================

insert into public.lab_experiments (experiment_id, title, question, benchmark, primary_metric, decision_rule,
  tuning_seasons, validation_seasons, holdout_seasons, data_notes, status, variants_tried)
values (
  'F4_market_ratings_table',
  'Market-implied team ratings for the projected final table',
  'Do team ratings read off closing market prices project final league points better than Dixon-Coles ratings? Per match, expected goals (home, away) are solved from the de-vigged Avg closing 1X2 and over/under 2.5 prices (independent Poisson). Ratings at a cutoff: time-weighted least squares on log expected goals (intercept, home advantage, attack, defence) over the league''s matches in the 730 days before the cutoff. Projection: actual points won to the cutoff plus expected points (3 P(win) + P(draw)) over the season''s remaining matches.',
  'Dixon-Coles as in production (dc_v1_1: half-life 180 days, no shrinkage, 730-day window, 10-match minimum), fitted at the same cutoff, same projection arithmetic (rho applied).',
  'Mean squared error of projected v actual final points won (before deductions), per league-season-checkpoint; paired difference DC minus market, mean and t over league-season-checkpoints.',
  'Checkpoints: the first date by which every team in the league-season has played 10, 19 and 29 league matches. Variants: market half-life 30, 60, 120, 240 days; the one with the lowest tuning MSE is carried forward (4 variants tried). Pass if, with that half-life, the market method''s MSE is lower than Dixon-Coles'' on validation (2024/25) and on the holdout (2025/26), both pooled over leagues and checkpoints. Pass: the Team Strength projected finish moves to market ratings, with the Dixon-Coles projection shown beside it and the gap stated. Otherwise recorded as a null result.',
  array[2019, 2020, 2021, 2022, 2023], array[2024], array[2025, 2026],
  'E0-E3. 2019/20 League One and League Two excluded (curtailed, final table on points per game). Remaining matches are the season''s actual played matches after the cutoff, so postponements are placed where they were played. 2026/27 is unfinished and not scored.',
  'registered', 0
);

create view public.lab_f4_lines with (security_invoker = true) as
select m.match_id, m.league_id, s.start_year, m.match_date, m.home_team_id, m.away_team_id,
  m.full_time_home_goals as hg, m.full_time_away_goals as ag,
  c.basic_home as p_home, c.basic_draw as p_draw, c.basic_away as p_away,
  (1 / ou.price_over) / (1 / ou.price_over + 1 / ou.price_under) as p_over
from public.matches m
join public.seasons s using (season_id)
join public.lab_market_probs c on c.match_id = m.match_id and c.bookmaker = 'Avg' and c.is_closing
join public.match_odds ou on ou.match_id = m.match_id and ou.market = 'ou25' and ou.bookmaker = 'Avg' and ou.is_closing
  and ou.price_over > 1 and ou.price_under > 1
where m.league_id between 1 and 4 and s.start_year >= 2019 and m.full_time_home_goals is not null;

revoke all on public.lab_f4_lines from anon, authenticated;
grant select on public.lab_f4_lines to service_role;

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Experiment F4 input: E0-E3 league matches from 2019/20 with result and the Avg closing 1X2 and over/under 2.5 prices de-vigged (basic, the F0 method). Private; read by scripts/lab_f4.py.',
  refresh_note = 'View over matches, lab_market_probs and match_odds.', purpose_reviewed_at = now()
where node_key = 'object:lab_f4_lines';
