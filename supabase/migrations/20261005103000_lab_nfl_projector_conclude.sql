-- NP1 concluded (holdout scored once, 5 Oct 2026; lab_scorings 45-48, 47 a
-- transcription correction to 46). Partial pass by the registered rule.
update public.lab_experiments
set status = 'passed', variants_tried = 4050, concluded_at = now(),
    conclusion = 'Partial pass. Chosen on tuning: half-life 12 games, last-season weight 0.6, shrinkage 3 games, team-total exponent 0.5, opponent exponent 0.5, opponent shrinkage 8. Holdout PPR MAE NP1 v P0: QB 6.52 v 7.08 (t -3.1) PASS; WR 5.75 v 6.33 (t -5.3) PASS; TE 5.18 v 5.75 (t -3.5) PASS; RB 5.67 v 5.98 (t -1.88) fail; K 3.84 v 4.09 (t -1.999) fail. All 3,872: 5.54 v 6.00 (t -4.3). NP1 had the lower MAE at every position in every split, but RB and K miss the registered t > 2. Site: projector shown for QB, WR, TE; RB and K show the season average, labelled. Follow-up: RB usage-share model (carries, targets, snaps) as a new experiment.'
where experiment_id = 'NP1' and concluded_at is null;
