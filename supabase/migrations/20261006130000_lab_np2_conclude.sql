-- ============================================================================
-- NP2 concluded (6 Oct 2026). Registered in 20261006120000 (merged and applied
-- before scoring). Tuning and validation run once with the registered grid
-- (1,728 variants); holdout scored once with the parameters fixed on tuning.
-- Result: FAILED the registered rule. RBs keep the season average on the site.
-- Safe to re-run: each scoring is inserted only if its split is not recorded.
-- ============================================================================

insert into public.lab_scorings (experiment_id, split, variant, n_matches, metrics, code_ref)
select 'NP2', 'tuning', 'hs12_ws1_c0.5_ke100_a0.5_b0.75', 4224, '{"pts": {"n": 4224, "mae_np2": 5.708, "mae_p0": 6.137, "mae_np1": 5.737, "diff_p0": -0.429, "t_p0": -7.74, "diff_np1": -0.03, "t_np1": -0.91}, "half": {"n": 4224, "mae_np2": 5.344, "mae_p0": 5.762, "mae_np1": 5.398, "diff_p0": -0.417, "t_p0": -8.31, "diff_np1": -0.054, "t_np1": -1.81}, "std": {"n": 4224, "mae_np2": 5.07, "mae_p0": 5.471, "mae_np1": 5.165, "diff_p0": -0.401, "t_p0": -8.73, "diff_np1": -0.095, "t_np1": -3.61}, "params": {"hs": 12.0, "ws": 1.0, "c": 0.5, "ke": 100.0, "a": 0.5, "b": 0.75}}'::jsonb, '0fbd768c7372'
where not exists (select 1 from public.lab_scorings where experiment_id = 'NP2' and split = 'tuning');

insert into public.lab_scorings (experiment_id, split, variant, n_matches, metrics, code_ref)
select 'NP2', 'validation', 'hs12_ws1_c0.5_ke100_a0.5_b0.75', 864, '{"pts": {"n": 864, "mae_np2": 5.501, "mae_p0": 5.746, "mae_np1": 5.547, "diff_p0": -0.245, "t_p0": -3.26, "diff_np1": -0.045, "t_np1": -0.64}, "half": {"n": 864, "mae_np2": 5.193, "mae_p0": 5.457, "mae_np1": 5.266, "diff_p0": -0.264, "t_p0": -3.42, "diff_np1": -0.072, "t_np1": -1.19}, "std": {"n": 864, "mae_np2": 4.954, "mae_p0": 5.234, "mae_np1": 5.056, "diff_p0": -0.281, "t_p0": -3.6, "diff_np1": -0.103, "t_np1": -1.88}, "params": {"hs": 12.0, "ws": 1.0, "c": 0.5, "ke": 100.0, "a": 0.5, "b": 0.75}}'::jsonb, '0fbd768c7372'
where not exists (select 1 from public.lab_scorings where experiment_id = 'NP2' and split = 'validation');

insert into public.lab_scorings (experiment_id, split, variant, n_matches, metrics, code_ref)
select 'NP2', 'holdout', 'hs12_ws1_c0.5_ke100_a0.5_b0.75', 1056, '{"pts": {"n": 1056, "mae_np2": 5.798, "mae_p0": 6.004, "mae_np1": 5.706, "diff_p0": -0.206, "t_p0": -1.28, "diff_np1": 0.092, "t_np1": 1.64}, "half": {"n": 1056, "mae_np2": 5.528, "mae_p0": 5.726, "mae_np1": 5.465, "diff_p0": -0.198, "t_p0": -1.37, "diff_np1": 0.063, "t_np1": 1.4}, "std": {"n": 1056, "mae_np2": 5.337, "mae_p0": 5.555, "mae_np1": 5.325, "diff_p0": -0.218, "t_p0": -1.67, "diff_np1": 0.012, "t_np1": 0.3}, "params": {"hs": 12.0, "ws": 1.0, "c": 0.5, "ke": 100.0, "a": 0.5, "b": 0.75}}'::jsonb, '0fbd768c7372'
where not exists (select 1 from public.lab_scorings where experiment_id = 'NP2' and split = 'holdout');

update public.lab_experiments
set status = 'failed', variants_tried = 1728, concluded_at = now(),
    conclusion = 'Failed. Chosen on tuning: share half-life 12 games, last-season share weight 1, snap-change exponent 0.5, efficiency shrinkage 100 pseudo-touches, team-total exponent 0.5, opponent exponent 0.75 (three at the edge of the registered grid; not re-tuned). RB PPR MAE NP2 v P0: tuning 5.708 v 6.137 (t -7.7); validation 5.501 v 5.746 (t -3.3); holdout 5.798 v 6.004 (t -1.28) -- misses t > 2. Against NP1 on the same rows: tuning 5.708 v 5.737, validation 5.501 v 5.547, holdout 5.798 v 5.706 (NP2 worse, t 1.64). Half-PPR and standard the same pattern (holdout t v P0 -1.37, -1.67). Usage shares add little over recency-weighted points: the snap-change factor was chosen (c 0.5) but the gain is within noise. Holdout MAEs for NP1 and P0 differ slightly from NP1''s recorded holdout (5.706 v 5.674; 6.004 v 5.978) because nflverse revised 2025-26 player stats since 5 Oct; same 1,056 rows. Site: RBs keep the season-to-date average.'
where experiment_id = 'NP2' and concluded_at is null;
