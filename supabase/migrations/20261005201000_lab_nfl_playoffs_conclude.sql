-- N2 (NFL play-off chances): amendment made before the holdout was opened,
-- then the conclusion. Scorings 49-51 (49 tuning, 50 validation with the
-- amendment note, 51 holdout). Run by hand: updates from the agent session
-- are cancelled at approval.
update public.lab_experiments
set primary_metric = primary_metric || ' AMENDED 5 Oct 2026, before the holdout was opened: clustered by team-season, not season (validation and holdout are one season each, so season clusters leave one cluster and no usable standard error).',
    status = 'failed', variants_tried = 1, concluded_at = now(),
    conclusion = 'Failed. Play-off Brier, hot Elo simulation v no-model simulation: tuning 2010-2023 0.1267 v 0.1333 (t -2.5); validation 2024 0.1031 v 0.1164 (t -1.7); holdout 2025 0.1732 v 0.1477 (worse, t +1.6). Division Brier and log loss the same pattern. Projected wins MAE: Elo 1.80, no model 1.93, current pace 2.10 (holdout). Not displayed. The no-model simulation is a strong baseline: it already has the results so far. Next: market-implied team ratings (as football F4) as N3.'
where experiment_id = 'N2' and concluded_at is null;
