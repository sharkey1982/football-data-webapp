-- ============================================================================
-- Model Lab: conclusion of E1 (Dixon-Coles for five European leagues),
-- scored once on the holdout on 25 Oct 2026 (lab_scorings, split holdout).
-- Nothing is switched on: eligible leagues wait for Chris's decision.
-- ============================================================================

update public.lab_experiments
   set status = 'passed',
       concluded_at = now(),
       conclusion = 'Partial pass. Holdout (2025/26 + 2026/27 to date), model minus Avg closing market in mean log loss (rule: <= 0.025) and model v baseline t (rule: > 2.58): '
         || 'Serie A 0.0219 / t 4.61 PASS; Scottish Premiership 0.0240 / t 2.91 PASS; La Liga 0.0252 / t 4.20 fail (gap over by 0.0002, not rounded); '
         || 'Bundesliga 0.0277 / t 3.60 fail; Ligue 1 0.0297 / t 2.79 fail. Every league beats the baseline clearly and trails the market by 0.02-0.03 nats, '
         || 'as the English leagues do (validation signs all positive). Serie A and the Scottish Premiership are eligible for predictions beside the market (Chris decides); '
         || 'the others are not predicted. A live version needs a fallback for newly promoted clubs (no second divisions loaded for these countries).'
 where experiment_id = 'E1_dc_europe' and concluded_at is null;
