-- ============================================================================
-- Model Lab: register E1 (Dixon-Coles for La Liga, Bundesliga, Serie A,
-- Ligue 1 and the Scottish Premiership) BEFORE it is scored. Chris, 25 Oct
-- 2026: test those leagues in addition to the five English ones; only leagues
-- where the model is roughly as good as the market go live.
-- Code: scripts/lab_e1.py (Model Lab workflow, job e1).
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'E1_dc_europe',
  'Dixon-Coles (dc_v1_1) for La Liga, Bundesliga, Serie A, Ligue 1 and the Scottish Premiership',
  'At production settings (dc_v1_1: half-life 180 days, no shrinkage, 730-day window, 10-match minimum), walk-forward weekly, does Dixon-Coles forecast 1X2 results in each of these five leagues well enough to show on the site beside the market: clearly better than knowing nothing about the teams, and no further behind the betting market than it is in the English leagues?',
  'The Avg closing 1X2 line, basic de-vig (the F0 benchmark), and a no-information baseline: the league''s home/draw/away frequencies over its tuning seasons.',
  'Per league: mean log loss of the 1X2 forecast; paired per-match differences (baseline minus model; model minus market), SE clustered by matchday. Secondary: 3-way Brier.',
  'No parameters are tuned (dc_v1_1 fixed); tuning seasons are scored for reference. A league passes if, on the holdout (2025/26 and 2026/27 to date, scored once): (1) the model beats the baseline in log loss with matchday-clustered t > 2.58 (one-sided 5%, Bonferroni for 5 leagues), and the difference has the same sign on validation (2024/25); and (2) the model''s mean log loss is no more than 0.025 nats behind the market (point estimate; 0.025 is how far it trailed the closing line in the English leagues on F1''s tuning seasons). A passing league becomes eligible for predictions on the site beside the market, as the English leagues are (Chris decides); a failing league is not predicted.',
  array[2019,2020,2021,2022,2023],
  array[2024],
  array[2025,2026],
  'football-data.co.uk season files SP1, D1, I1, F1, SC0 from 2017/18 (two seasons of fitting history before the first tuning season), read directly by the lab script: the database holds results but no odds for these leagues, and nothing is written to match_odds or model_fit_runs. Clubs identified by football-data.co.uk names. A match is scored when both clubs have 10+ matches in the fitting window and the file has the Avg closing line; newly promoted clubs early in a season are therefore skipped (production estimates them from the division below, which is not loaded for these countries -- a live version would need that or another fallback). Ligue 1 2019/20 was curtailed (279 matches). Scotland''s 38-game split season is fitted as one league.'
)
on conflict (experiment_id) do nothing;
