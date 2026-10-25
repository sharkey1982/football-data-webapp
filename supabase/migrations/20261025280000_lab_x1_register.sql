-- ============================================================================
-- Model Lab: register X1 (a start-probability model from playing records)
-- BEFORE it is scored. Chris, 25 Oct 2026: "we need to work on our own player
-- position projecting". GW8 25 Oct 14:00: the published model got 71 of 88
-- starters, "same XI as the last league game" 70 of 88.
-- Code: scripts/lab_x1_start_model.py (reads local copies of the data once;
-- no heavy queries against the database).
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'X1_start_model',
  'Start probability from playing records: a logistic model on last-match start, recent start rate, minutes, FPL flags and midweek games, scaled to 11 per side',
  'Does a simple calibrated model of each player''s chance to start, from what was known before the deadline, beat both the published model and the naive '
  || '"same XI as the last league game"? Features (per player and fixture, point in time): started the team''s last league game; start rate and available '
  || 'matches over the last 5 team league games; share of minutes over the last 3; FPL status and chance of playing at the deadline (daily snapshot before '
  || 'the deadline); the team played a cup or European game 2-5 days before (fixtures) and its interaction with last-match start; goalkeeper; season '
  || 'starts so far. Logistic regression, L2 strength chosen on tuning, then each side''s probabilities shifted on the logit scale so they sum to 11. '
  || 'Predicted XI = the top goalkeeper and the top 10 outfield players by probability.',
  'The published production model: start_probability in the pre-deadline snapshot (fpl_deadline_player_horizon, snapshot_kind pre_deadline, '
  || 'leaguewide_v6), which exists for GW7 and GW8 only. And the naive last-XI guess: the 11 who started the team''s previous league game (for Brier, '
  || 'the start rates of "started last" and "did not" estimated on tuning).',
  'Brier score and log loss of start probability over every player-fixture in the holdout that is in the published snapshot; secondary: starters right '
  || '(predicted XI v actual starters, per side).',
  'Adopt iff, over the holdout (GW7 and GW8 of 2026/27; every player in the published pre-deadline snapshot whose side played once that gameweek, actual '
  || 'start from FPL starts): (1) X1 beats the published model on BOTH Brier score and log loss, AND (2) X1''s predicted XIs get at least 9 more starters '
  || 'right than the naive last-XI guess (of 440, about 2 percent). Scored once. Validation (GW6) is reported, not decisive. A blend of X1 with the '
  || 'published model (equal weights on the logit scale) is reported for information only.',
  array[2026],
  array[2026],
  array[2026],
  'Gameweek splits inside 2026/27: tuning GW2-5 (GW1 has no previous match), validation GW6, holdout GW7-8. GW8''s fixtures were not yet marked finished '
  || 'by FPL when this was registered (bonus pending), but every GW8 game had been played and fpl_player_gameweeks held all 220 starts; starts do not change '
  || 'with bonus. The holdout is the same gameweeks as D1''s, which has not been scored; X1 is a different model scored once on them. Disclosure: on 25 Oct '
  || 'the published model and the last-XI guess were compared informally for the 8 sides in GW8''s 14:00 games (71 v 70 of 88); X1''s features and rule '
  || 'were fixed after that, with no X1 scoring of GW7 or GW8. FPL flags come from fpl_player_snapshots (daily) taken on or before the deadline date; '
  || 'cup/European games from fixtures (leagues 6-11) involving the side. Player-level cup line-ups (cup_lineup_players) cover too few games to use.'
)
on conflict (experiment_id) do nothing;
