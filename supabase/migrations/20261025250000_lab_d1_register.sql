-- ============================================================================
-- Model Lab: register D1 (low-down picks in the depth chart) BEFORE it is
-- scored. Chris, 25 Oct 2026: "we need a better way to avoid very low down
-- picks getting put into the model outputs as it ruins credibility". Man Utd
-- GW8: Zirkzee (fallback CF, no starts all season) published 90% to start.
-- Code: scripts/lab_d1_depth_guard.py (Model Lab workflow, job d1);
-- rules in scripts/fpl_depth_chart.py (D1 block, all off until adopted).
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'D1_depth_guard',
  'Depth chart: no places from fallback roles, evidence-based backup take rate, and a plausibility cap on start chances',
  'Do three rules cut implausible start chances (low-down picks published as likely starters) without making the start probabilities worse overall? '
  || '(1) players whose role only comes from the FPL-position fallback do not create places in place-counting (they can still fill open places); '
  || '(2) a backup takes an open place at min(0.9, (starts + 0.9 K) / (available + K)) instead of a flat 0.9, K chosen on tuning from 1, 2, 3, 5, 10 by Brier; '
  || '(3) a start chance >= 0.60 for a player who started <= 1 of his last 5 team matches while available (and was available for >= 2), '
  || 'and is not a hand-set first choice (rank 1 from manual or a BBC line-up, or an admin start-when-fit), is cut to 0.40, nothing redistributed.',
  'The current production depth chart (scripts/fpl_depth_chart.py: start record half-life 3, first-choice K 3, ties by rate, flat 0.9 backup take). '
  || 'For information: each rule alone, and the naive "same XI as his last league match" guess.',
  'Brier score and log loss of the start probability over every outfield depth-chart player-match (actual start from FPL starts).',
  'Adopt iff the combined rule (1+2+3 with K tuned on GW3-5) beats the current model on BOTH Brier score and log loss over every outfield '
  || 'depth-chart player-match of the holdout (GW7 and GW8 of 2026/27), scored once after GW8 has finished. Validation (GW6) is reported, not decisive. '
  || 'Starters right (top 10 outfield per club v actual starters) and the last-XI baseline are reported for information.',
  array[2026],
  array[2026],
  array[2026],
  'Gameweek splits inside 2026/27 (all of it is the sealed holdout season, so each split is scored once): tuning GW3-5, validation GW6, holdout GW7-8. '
  || 'Pecking order: the frozen copy depth_deep_backup_gw7 (fpl_pecking_order_snapshots, taken 11 Oct before the GW7 deadline), so the holdout cannot see later line-ups; '
  || 'tuning and validation use the same copy (taken after them, as in earlier depth backtests). Role and rank sources come from today''s team_player_tactical_defaults '
  || '(not versioned; only a handful of ranks were set by hand after 11 Oct). Other inputs point in time as in scripts/backtest_depth_floor.py; formations from fixture_team_tactical_consensus. '
  || 'Motivated by one GW8 case (Zirkzee): GW8 is in the holdout, so the holdout is not wholly blind to the problem, but the rules were fixed before any GW7-8 scoring.'
)
on conflict (experiment_id) do nothing;
