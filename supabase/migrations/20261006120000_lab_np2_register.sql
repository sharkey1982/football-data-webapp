-- ============================================================================
-- NFL Model Lab: register NP2 (running-back usage projection) BEFORE it is
-- scored. Follow-up to NP1, whose RB projection missed its rule (t -1.88), so
-- the site shows RBs' season-to-date average. Code: scripts/nfl_rb_usage_lab.py.
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'NP2',
  'NFL running-back projection from usage (carry, target and snap shares) v season-to-date average',
  'Does a running-back projection built from usage -- his recency-weighted share of team carries and targets, adjusted by his latest snap share against his usual, times his team''s carries and targets per game and his points per carry and per target (shrunk to the league RB rate), scaled by NP1''s market team-total and opponent factors -- forecast his PPR fantasy points better than his season-to-date average?',
  'P0: the player''s season-to-date mean PPR points per game before the week (week 1, or no game yet this season: his previous-season mean). Secondary comparison: NP1.',
  'mean absolute error of PPR points for RBs (incl. FB); paired per-player-week difference, week-clustered SE. Same evaluation set as NP1''s RB rows: regular season, the player appeared, the game has a closing spread and total, he has an earlier game this or last season, top 48 RBs each week by P0. Holdout 2026 = weeks 1-4 (as NP1). Secondary: half-PPR and standard; MAE v NP1.',
  'Parameters (share half-life hs in games 1/2/3/4/6/12, last-season share weight 0.3/1, snap-change exponent c 0/0.5/1, efficiency shrinkage ke 0/20/50/100 pseudo-touches, team-total exponent a 0/0.5/1, opponent exponent b 0/0.25/0.5/0.75; 1,728 variants) chosen on tuning by RB PPR MAE; nothing re-tuned after. Fixed: team volume half-life 8 team-games, efficiency half-life 12 games, last-season weight 0.6, NP1''s market and opponent inputs. Pass if NP2''s holdout MAE beats P0 with paired t > 2: the site then shows NP2 for RBs; otherwise RBs keep the season average. The holdout is scored once. Note: NP1''s holdout result on the same rows is already known; NP2''s design used no holdout data.',
  array[2019,2020,2021,2022,2023],
  array[2024],
  array[2025,2026],
  'nflverse stats_player_week (carries, targets, receptions, rushing and receiving yards, TDs, 2-pt, fumbles lost; team totals summed from player rows), snap_counts (offense_pct; PFR ids mapped to gsis via players.csv; about 94% of RB rows matched; unmatched rows get no snap adjustment), nfldata games.csv (spread, total). Points with the site''s rules. Conditional on the player playing.'
)
on conflict (experiment_id) do nothing;
