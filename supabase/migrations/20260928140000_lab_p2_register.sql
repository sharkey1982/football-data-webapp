-- ============================================================================
-- Model Lab P2: minutes after a start (exit bands). Registered before any
-- result was computed.
--
-- The FPL projection gives every starter 2 appearance points and the
-- full-match clean-sheet chance. FPL gives 1 appearance point (and no clean
-- sheet) to a starter off before 60 minutes, and a clean sheet to one off
-- between 60 and 84 if nothing was conceded while he was on. P2 tests a
-- per-player model of how a start ends: off before 60 / off 60-84 / 85+.
-- ============================================================================

insert into public.lab_experiments (experiment_id, title, question, benchmark, primary_metric, decision_rule,
  tuning_seasons, validation_seasons, holdout_seasons, data_notes, status, variants_tried)
values (
  'P2_minutes_exit_bands',
  'Minutes after a start: exit-band model',
  'Given that a player starts, how does his match end: off before 60 minutes, off at 60-84, or 85+? Per player: recency-weighted counts of his own previous starts in each band (half-life h starts), blended with his position''s band shares as a prior of strength k (Dirichlet-multinomial mean).',
  'Position band shares alone (B1); and for appearance points, the current projection rule that every starter gets 2 (B0).',
  'Mean multinomial log loss of the band per start, paired per start v B1, SE clustered by gameweek. Secondary: squared error of expected appearance points given a start (1 x P(off before 60) + 2 x P(60+)) against actual (1 or 2), v B0 and B1.',
  'Variants: k in {2, 5, 10, 20} x h in {10, 20, 40, unlimited} starts (16); the lowest tuning log loss is carried forward. Pass if, with that variant, log loss beats B1 on validation and on the holdout (holdout t > 2), and appearance-points squared error beats B0 on both. Pass: the FPL projection''s appearance and clean-sheet points use the exit bands (clean sheet for 60-84 on the minutes on the pitch, none before 60, as FPL scores it). Otherwise null result.',
  array[2023], array[2024], array[2025, 2026],
  'Starts are recorded by FPL fully from 2023/24 (partly in 2022/23, not in 2021/22). History input: every recorded start from 2022/23 on; scored: starts in the split''s seasons. 2026/27 from fpl_player_gameweeks (per-fixture stats). Position from the season''s FPL element type.',
  'registered', 0
);
