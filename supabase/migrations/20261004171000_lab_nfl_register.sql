-- ============================================================================
-- NFL Model Lab: register N0 (market benchmark) and N1 (margin Elo) BEFORE
-- either is scored (protocol of 28 Sep 2026: rule first, holdout once).
--
-- NFL splits (Chris, 4 Oct 2026): tuning 2010-2023 (moneylines complete from
-- 2010), validation 2024, sealed holdout 2025 + 2026. Seasons 2002-2009 are
-- rating burn-in only and never scored. All game types; ties excluded from
-- the win metrics (15 since 2002).
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'N0',
  'NFL market benchmark: moneyline v spread-implied win probability',
  'Which closing-market source gives the better pre-game home-win probability: the two-way moneyline with the margin removed (basic, proportional), or the closing spread read as Normal(spread, sigma) with sigma fitted on tuning?',
  'Each other (this experiment chooses the NFL benchmark).',
  'mean log loss of the home-win probability, ties excluded; paired per-game difference, week-clustered SE',
  'The benchmark is the source with the lower mean log loss on tuning. Differences under 0.001 nats go to the moneyline (simpler, needs no fitted sigma). Validation is reported; the holdout is not used (a benchmark choice, not a model).',
  array[2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023],
  array[2024],
  array[2025,2026],
  'nflverse games.csv via public.nfl_lab_games: closing spread_line (+ = home favoured), home/away moneylines (American). Neutral-site games have no home advantage in any model but the prices already reflect that.'
),
(
  'N1',
  'NFL margin-based Elo v the closing market',
  'Does a margin-of-victory Elo rating (the NFL equivalent of Dixon-Coles here) forecast NFL results usefully, and does it add anything to the closing market?',
  'N0 benchmark (closing market); also a home-field-only baseline.',
  'mean log loss of the home-win probability, ties excluded; paired per-game difference, week-clustered SE. Secondary: mean absolute error of the predicted margin.',
  'Variant (K, home advantage, between-season regression) chosen on tuning by log loss; nothing re-tuned after. Two parts, both decided on the holdout scored once. (A) Display: the Elo becomes the NFL match-page model if its holdout log loss beats the home-field-only baseline (p = tuning home win rate; 0.5 at neutral sites) with paired t > 2; pages then show it beside the market with the gap stated, as for football. (B) Market value: fit the log-linear pool logit p = a*logit(p_market) + b*logit(p_elo) on tuning. Elo adds information only if b > 0 with t > 2 on tuning AND the pool beats the market on validation; only then must the pool beat the market on the holdout with t > 2. If the first two conditions fail, (B) is a null result and the pool is not scored on the holdout.',
  array[2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023],
  array[2024],
  array[2025,2026],
  'Elo from 2002 week 1 (all teams 1500), walk-forward game by game: P(home) = 1/(1+10^(-(Rh-Ra+HFA)/400)); update K x ln(|margin|+1) x 2.2/(0.001 x winner Elo edge + 2.2) x (result - P); at each new season R = 1500 + (1-r)(R-1500). Predicted margin = Elo edge / 25. Grid: K {15,20,25,30} x HFA {30,45,60} x r {0.25,0.33,0.5} = 36 variants. Market = N0 winner.'
);
