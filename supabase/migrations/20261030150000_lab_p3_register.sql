-- ============================================================================
-- Model Lab: register P3 (defensive contribution from a count model with the
-- real threshold) BEFORE it is scored. The 27 Sep 2026 experiment (tackles
-- added to the defender CBI rate, null result) named this as the next step.
-- Code: scripts/lab_p3_defcon.py (Model Lab workflow, job p3; reads the data
-- once into a local cache, no heavy queries against the database).
-- ============================================================================

insert into public.lab_experiments
  (experiment_id, title, question, benchmark, primary_metric, decision_rule,
   tuning_seasons, validation_seasons, holdout_seasons, data_notes)
values
(
  'P3_defcon_count',
  'Defensive contribution (DEFCON) from a negative binomial count model with the official definition and threshold',
  'Does modelling the defensive-action count itself beat the production curve at predicting a defensive contribution? Per player-match: count = FPL '
  || 'defensive_contribution (defenders CBI + tackles, threshold 10; midfielders and forwards CBI + recoveries + tackles, threshold 12). '
  || 'Rate per 90 = (sum w c + K mu_pos) / (sum w minutes/90 + K) over the player''s earlier appearances in both seasons (counts taken with the target '
  || 'match''s position definition), w = 0.5^(days before / H), mu_pos = the position''s tuning mean per 90. Mean count = rate x minutes/90 x '
  || 'exp(beta_g x (share - player''s history mean share)), where share = the team''s share of the match''s market expected goals (closing 1X2 and '
  || 'over/under 2.5, independent Poisson): the ONE pre-registered game-state feature, fitted on tuning (beta_g for defenders, and for midfielders + '
  || 'forwards together). Count ~ negative binomial with size phi_pos (3 values). P(DEFCON) = mean over a minutes distribution of P(count >= threshold | '
  || 'minutes): the player''s last 10 appearances plus 2 pseudo-appearances from the position''s tuning minutes (conditional on playing, as the scored '
  || 'population is 1+ minute). Tuned on tuning only, then frozen: K from 1, 3, 6, 10, 20 and H from 60, 120, 240, 480 days or no decay (25 variants) '
  || 'by tuning DEFCON log loss; phi and beta by maximum likelihood of the tuning counts given actual minutes.',
  'The production formula (fpl_defensive_contribution_projection_leaguewide, 30 Oct 2026): start x base x exp(0.28 x (shrunk90 - prior90)) x '
  || 'min(1, xmins/60), cap 0.9, shrunk90 = (season-to-date events + 5 prior90) / (season minutes + 450) x 90; defenders CBI only, prior 7.143, base '
  || '0.255; midfielders CBI + recoveries + tackles, 7.107 / 0.125; forwards 3.681 / 0.01. Start and xmins from the same minutes distribution as P3 '
  || '(start share and mean minutes of it), so only the defensive part differs. Second benchmark: the naive season-to-date hit rate shrunk to the '
  || 'position''s tuning hit rate, (hits + k p_pos) / (apps + k), k from 1, 2, 5, 10, 20 by tuning log loss.',
  'Brier score and log loss of P(DEFCON) over every defender, midfielder and forward player-match with 1+ minute (log loss with p clipped to '
  || '[0.0001, 0.9999]); calibration = mean predicted minus actual rate. Defenders, midfielders and forwards reported separately; paired differences '
  || 'with SEs clustered by fixture.',
  'Pass iff, on the holdout (2026/27 GW1-8, every defender, midfielder and forward player-match with 1+ minute): (1) P3 has a lower Brier score than '
  || 'the production formula, AND (2) a lower log loss, AND (3) |P3 mean predicted - actual rate| <= 0.02. Scored once. Validation is reported, not '
  || 'decisive; defenders on their own and the naive benchmark are reported, not decisive. A pass does not switch production: the conclusion '
  || 'describes the change for Chris to approve.',
  array[2025],
  array[2025],
  array[2026],
  'Splits: tuning 2025/26 GW1-25, validation 2025/26 GW26-38, holdout 2026/27 GW1-8 (all finished; GW9 starts 31 Oct). DEFCON stats exist only from '
  || '2025/26, so the tuning and validation gameweeks are inside the season the programme seals: 2025/26 is used for fitting here and is not a '
  || 'holdout for P3; 2026/27 GW1-8 is. The 27 Sep experiment already scored 2025/26 GW20-38 (a different model). Rates for 2026/27 use 2025/26 '
  || 'matches as history (data, not fitted parameters). 2025/26 per-fixture stats from vaastav/Fantasy-Premier-League (data/2025-26 merged_gw.csv, '
  || 'players_raw.csv for fpl_code, teams.csv; the file hashes are stored with the scoring); 2026/27 from fpl_player_gameweeks.source_payload stats '
  || '(per fixture; checked equal to fpl_live_elements for GW1-8); market lines from market_closing_lines (Premier League, 380 + 80 matches). '
  || 'Disclosures: (a) 2026/27 outcomes were looked at informally before registration: Bournemouth''s Silva 6 of 8 games at 10+ CBIT against a '
  || 'production value of 0.35, and league-wide 2026/27 team-matches showing FPL difficulty barely relates to defenders'' CBIT (r 0.05) while '
  || 'shots faced does (r 0.41), which is why a pre-match proxy for shots faced (market goal share) is the one feature; it is included with its '
  || 'coefficient fitted on 2025/26 tuning only. (b) Closing lines are later than the FPL deadline, slightly better informed than the prices a live '
  || 'model would use. (c) The minutes distribution is a simple one from playing records (no published 2025/26 projections exist); all three models '
  || 'get the same one. The published pre-deadline value (leaguewide_v6, GW6-8, unconditional on playing) is reported for information only.'
)
on conflict (experiment_id) do nothing;
