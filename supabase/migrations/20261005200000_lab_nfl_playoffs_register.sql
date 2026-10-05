-- ============================================================================
-- NFL Model Lab: register N2 (play-off chances) BEFORE it is scored
-- (protocol of 28 Sep 2026: rule first, holdout once).
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'N2',
  'NFL play-off chances: hot Elo season simulation v a no-model simulation',
  'Do play-off chances from simulating the rest of the regular season with the N1 margin Elo (ratings updating inside each simulation; official tie-breaks and seeding) forecast which teams make the play-offs better than the same simulation with no model (every game a coin flip but for home advantage)?',
  'The same simulation with P(home win) = Elo home advantage only (45 points, p = 0.564; 0.5 at neutral sites) and no rating updates.',
  'Brier score of P(make the play-offs) per team at three checkpoints a season (after weeks 4, 8 and 12 of the regular season); paired per team-checkpoint difference, clustered by season. Secondary: log loss; Brier of P(win the division); mean absolute error of projected wins against actual regular-season wins. 2,000 simulations per checkpoint (seeded, repeatable).',
  'No parameters are tuned: K 20, home advantage 45, regression 0.5 come from N1; margins Normal(edge/25, 13.26) from the game-page margin curve. Tuning seasons are scored for reference only. N2 is displayed on the League Table if its holdout Brier beats the no-model simulation with paired t > 2. The holdout is scored once.',
  array[2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023],
  array[2024],
  array[2025],
  'nflverse nfldata games.csv, all game types for the Elo walk from 2002; regular season for standings. Tie-breaks and seeding: src/lib/nflTiebreak.ts (matches every real play-off field 2002-2025). 2026 is excluded until it is complete.'
);
