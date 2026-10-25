-- Model Lab: conclusion of X1_start_model (registered 20261025280000, scored once
-- on the GW7-8 holdout on 25 Oct 2026 by the Model Lab job x1, code 3027a85).
update public.lab_experiments
   set status = 'failed',
       concluded_at = now(),
       conclusion = 'Failed; no production change. Holdout GW7-8, 1,335 player-fixtures in the published pre-deadline snapshot, 40 sides: '
         || 'Brier / log loss / starters right of 440: X1 0.0939 / 0.3107 / 358; published leaguewide_v6 0.0914 / 0.3004 / 355; '
         || 'naive last XI 0.1152 / 0.3911 / 350. Rule (1) fails (X1 worse than the published model on both; paired Brier +0.0025, se 0.0047); '
         || 'rule (2) fails by one (X1 +8 starters over naive, rule >= 9). Per GW: GW7 X1 0.0844 v published 0.0888 (182 v 175 v naive 179); '
         || 'GW8 X1 0.1034 v published 0.0939 (176 v 180 v naive 171). Validation GW6: X1 0.0791 / 187 of 220 v naive 0.0972 / 183. '
         || 'For information only (not the registered rule): the equal logit blend of X1 and the published model scored 0.0862 / 0.2811 / 363, '
         || 'better than both on every measure; a candidate to register and score on unseen gameweeks (GW9 onwards). '
         || 'Disclosed at build time: FPL flag snapshots start 13 Sep, so GW2-4 rows had no deadline flag (flag_known 0).'
 where experiment_id = 'X1_start_model' and concluded_at is null;
