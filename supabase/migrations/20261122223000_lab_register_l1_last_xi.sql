-- ============================================================================
-- Model Lab: register L1 (start probability built from the last XI, then the
-- changes) BEFORE it is scored. Chris, 22 Nov 2026: "If selecting the same
-- team as last week is more accurate - should team selection approach change
-- to starting with previous team sheets and identifying most likely players
-- to be replaced somehow? Rather than current approach" / "Go ahead now".
-- Code: scripts/lab_l1_last_xi.py (X1's point-in-time data and features).
-- Safe to re-run.
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'L1_last_xi_changes',
  'Start probability from the last league XI, minus the reasons each player drops out, with vacancies filled by position',
  'Does a start model that begins from the side''s last league XI beat the published model? Per side and fixture, from what was known before the '
  || 'deadline: each player who started the last league game keeps his place with probability r (goalkeepers r_gk), times his FPL chance of playing '
  || 'at the deadline (0 if out), times e if he went off before 60 minutes last time without a flag, times c if the side played a cup or European '
  || 'game 2-5 days before. Each shortfall is a vacancy in that player''s position (GK/DEF/MID/FWD); the position''s other players fill it in '
  || 'proportion to chance x (start rate over their last 5 available games + a), capped at 0.95, with any remainder shared across all outfield '
  || 'candidates. Five parameters (r, r_gk, e, c, a) chosen on tuning by Brier from a 405-point grid. Predicted XI = top goalkeeper + top 10 outfield.',
  'The published production model: start_probability in the latest pre-deadline snapshot (fpl_deadline_player_horizon, snapshot_kind pre_deadline, '
  || 'leaguewide_v6). And the naive last XI: the 11 who started the side''s previous league game.',
  'Brier score and log loss of start probability over every player in the published pre-deadline snapshot whose side played once that gameweek; '
  || 'secondary: starters right (predicted XI v actual starters).',
  'Adopt iff, over the holdout (GW11 of 2026/27), (1) L1 beats the published model on BOTH Brier score and log loss, AND (2) L1''s predicted XIs get '
  || 'at least as many starters right as the naive last XI. Scored once, after every GW11 side has 11 recorded starts. Validation (GW9-10) is '
  || 'reported, not decisive.',
  array[2026],
  array[2026],
  array[2026],
  'Gameweek splits inside 2026/27: tuning GW2-8, validation GW9-10, holdout GW11 (its last game, Mon 23 Nov 20:00, not yet played when registered). '
  || 'Disclosures: (1) before registration, aggregate starters right were seen for the published model and the naive last XI in GW8-11 '
  || '(public.social_lineup_checks: GW9 180 v 186, GW10 183 v 191, GW11 to Sun 22 Nov 152 v 159 of 198), and per-side misses for GW11; L1 itself was '
  || 'not run on any gameweek before registration. (2) X1 (25 Oct) found "started the last league game" its strongest feature; L1 is a different, '
  || 'structured model, not X1 refitted. (3) The holdout is a single gameweek (about 670 player rows, 20 sides), so a pass is provisional: GW12 will be '
  || 'reported as a forward check. FPL flags from fpl_player_snapshots (daily) on or before the deadline; GW2-4 have no flag snapshot (treated as no '
  || 'flag, as in X1). Cup and European games from fixtures (leagues 6-11).'
)
on conflict (experiment_id) do nothing;
