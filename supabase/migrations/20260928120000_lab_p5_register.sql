-- ============================================================================
-- Model Lab P5: market-rating team goals as the FPL projection's team input.
-- Registered before any result was computed.
--
-- The FPL projection takes each side's expected goals (allocated to players)
-- and clean-sheet chance (exp(-opponent expected goals)) from the fixture's
-- Dixon-Coles prediction. P5 asks whether expected goals from market ratings
-- (the F4 method, half-life 30 days, fixed -- no tuning) made at the same
-- time before each match forecast team goals and clean sheets better.
-- ============================================================================

insert into public.lab_experiments (experiment_id, title, question, benchmark, primary_metric, decision_rule,
  tuning_seasons, validation_seasons, holdout_seasons, data_notes, status, variants_tried)
values (
  'P5_market_team_goals',
  'Market-rating team goals as the FPL projection input',
  'Do expected goals from market ratings (F4 method: ratings from de-vigged closing 1X2 and over/under 2.5 of matches up to the forecast date, half-life 30 days) forecast each side''s goals and clean sheets better than the walk-forward Dixon-Coles prediction made at the same forecast date?',
  'Dixon-Coles walk-forward predictions (experiment dc_walkforward_v1, variant hl180_s0: production dc_v1_1 settings), forecast weekly up to 7 days before each match.',
  'Mean Poisson log loss of each side''s actual goals (home and away summed per match), paired per match (DC minus market, positive = market better), matchday-clustered SE. Secondary: clean-sheet Brier with P(clean sheet) = exp(-opponent expected goals), as the FPL projection computes it.',
  'No tuning (method and half-life fixed by F4). Pass if the market is better on the holdout (2025/26 and 2026/27 to date) with t > 2 and better on validation (2024/25). Pass: FPL team expected goals and clean-sheet chances come from market ratings for Premier League fixtures (Dixon-Coles stays on match pages). Otherwise null result.',
  array[2019, 2020, 2021, 2022, 2023], array[2024], array[2025, 2026],
  'E0-E3 (Premier League reported separately). Matches where both methods have a forecast: DC skips teams with under 10 matches in its window; the market needs each team to have a priced match in the league within 730 days before the forecast date.',
  'registered', 1
);
