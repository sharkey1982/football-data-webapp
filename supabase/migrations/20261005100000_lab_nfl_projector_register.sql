-- ============================================================================
-- NFL Model Lab: register NP1 (weekly fantasy-points projector) BEFORE it is
-- scored (protocol of 28 Sep 2026: rule first, holdout once).
--
-- Splits follow the NFL games experiments: tuning 2019-2023, validation 2024,
-- sealed holdout 2025 + 2026. 2018 is history only (week-1 priors).
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'NP1',
  'NFL weekly fantasy projection: market team totals, recency, opponent v season-to-date average',
  'Does a projection built from the player''s recency-weighted points (shrunk to his position), scaled by his team''s market-implied points for the game and the opponent''s points allowed to his position, forecast a player''s PPR fantasy points better than his season-to-date average?',
  'P0: the player''s season-to-date mean PPR points per game before the week (week 1, or no game yet this season: his previous-season mean).',
  'mean absolute error of PPR points, per position (QB, RB incl. FB, WR, TE, K); paired per-player-week difference, week-clustered SE. Scored on fantasy-relevant player-weeks: regular season, the player appeared, the game has a closing spread and total, he has an earlier game this or last season, and he ranks in the week''s top QB 24 / RB 48 / WR 60 / TE 24 / K 20 by P0 (pre-game information only, same set for both). Secondary: half-PPR and standard MAE; all appearing players.',
  'Parameters (half-life in games, previous-season weight, shrinkage pseudo-games, team-total exponent a, opponent exponent b, opponent shrinkage) chosen on tuning by overall PPR MAE; nothing re-tuned after. A position passes if NP1''s holdout MAE beats P0 with paired t > 2. The projector is shown on the site for passing positions only; a failing position shows the season average labelled as such. The holdout is scored once.',
  array[2019,2020,2021,2022,2023],
  array[2024],
  array[2025,2026],
  'nflverse stats_player_week (regular season) and nfldata games.csv: spread_line (+ = home favoured), total_line. Implied team points = total/2 +/- spread/2. Points scored with the site''s rules (nfl.points_std; +0.5 / +1 a reception). Projections are conditional on the player playing: injuries and inactives are handled by the live page, not this test.'
);
