-- Model Lab: conclusion of P3_defcon_count (registered 20261030150000, scored
-- once on the 2026/27 GW1-8 holdout on 30 Oct 2026 by the Model Lab job p3,
-- code 057061f). Production is NOT switched: the change is described below
-- for Chris to approve.
update public.lab_experiments
   set status = 'passed',
       concluded_at = now(),
       conclusion = 'Passed; production not switched (for Chris to approve). Chosen on tuning: prior strength K = 3 matches, no recency decay '
         || '(H none; every H within 0.0005 log loss), NB size 13.2 / 16.5 / 9.3 (DEF / MID / FWD), market goal share beta -0.33 (defenders) '
         || 'and -0.16 (midfielders + forwards); naive k = 5. '
         || 'Holdout 2026/27 GW1-8, 2,300 outfield player-matches with 1+ minute, Brier / log loss / mean predicted v actual 0.1213: '
         || 'P3 0.0895 / 0.2948 / 0.134; production formula (same minutes inputs) 0.0946 / 0.3142 / 0.117; naive season hit rate 0.0949 / 0.3189 / 0.130. '
         || 'Paired P3 minus production: Brier -0.0051 (se 0.0015, t -3.5), log loss -0.0194 (se 0.0040, t -4.8), SEs clustered by fixture. '
         || 'Rule: (1) Brier yes, (2) log loss yes, (3) calibration gap 0.013 <= 0.02 yes. '
         || 'Defenders (842): P3 0.1473 / 0.4571 / 0.215 v actual 0.215; production 0.1575 / 0.4875 / 0.195 (paired Brier -0.0103, t -3.5). '
         || 'Midfielders (1,173): P3 0.0690 / 0.2437 but over-predicts (0.107 v 0.083); production 0.0716 / 0.2598 / 0.089. '
         || 'Forwards (285): all models about 0.0036 Brier (actual 0.0035). '
         || 'Validation 2025/26 GW26-38 (3,656): P3 0.0920 / 0.2977 / 0.139 v 0.128; production 0.0942 / 0.3087; naive 0.0943 / 0.3092. '
         || 'For information, GW6-8 rows in the published pre-deadline snapshot (861): published leaguewide_v6 0.1011 / 0.3580 (mean 0.094, '
         || 'unconditional on playing), P3 0.0999 / 0.3228. '
         || 'Proposed production change: replace the exponential curve in fpl_defensive_contribution_projection_leaguewide with P(count >= 10 '
         || 'defenders / 12 others) under a negative binomial whose mean = rate90 x minutes / 90 x exp(beta x (market goal share - the player''s '
         || 'minutes-weighted history share)), rate90 = (CBIT or CBIRT since 2025/26 + 3 x 7.762 / 8.609 / 4.616) / (minutes / 90 + 3), '
         || 'averaged over the projection''s own minutes distribution (start x exit bands, sub appearance x sub minutes), share from pre-deadline '
         || 'prices. Watch the midfielder over-prediction after the switch. Next match, conditional on playing, neutral game state, P3 v the '
         || 'production formula with the same minutes: Hill 0.57 v 0.33, Silva 0.46 v 0.35, Truffert 0.28 v 0.17 (live view: 0.32 / 0.35 / 0.17).'
 where experiment_id = 'P3_defcon_count' and concluded_at is null;
