-- Audit 2026-10-22, DQ-10: retire the last two legacy_pre_v1 fits.
--
-- On 23 Sep the legacy_pre_v1 fits for E0, E1 and EC (#2, #3, #6) were
-- rejected and their 2026/27 fixture predictions re-predicted point-in-time
-- (20260923160000, 20260923200000). League One (#4) and League Two (#5) were
-- left 'accepted' because their scoring level is sound (implied 2.51 and 2.56
-- goals a game, in line with the dc_v1 fits: 2.60-2.70 and 2.47-2.51). But the
-- version itself was retired on 23 Sep, so 80 played 2026/27 fixtures (E2 36,
-- E3 44) still showed predictions from a retired version, written after
-- kick-off (11-23 Sep, before the kick-off guard existed).
--
-- Same treatment as 23 Sep:
--   1. each fixture predicted from #4/#5 is re-predicted with dc_baseline_v1
--      (exp(ha + att - def)) from the newest accepted fit dated strictly before
--      its kick-off that rates both teams (E2: retro-fits 396-400; E3: 921);
--      with no such fit the prediction is cleared. Old values go to
--      prediction_corrections.
--   2. fits #4 and #5 are rejected with the reason.
--   3. a model_change_log row.
-- Safe to re-run: step 1 finds no fixtures on #4/#5 once applied; step 2 is
-- guarded on status; step 3 on the title.

with tgt as (
  select f.fixture_id, f.league_id, f.kickoff_date, f.home_team_id, f.away_team_id,
         f.prediction_fit_run_id, f.prediction_model_version,
         f.predicted_home_goals, f.predicted_away_goals, f.predicted_at
    from public.fixtures f
   where f.prediction_fit_run_id in (4, 5)
),
chosen as (
  select distinct on (t.fixture_id) t.fixture_id, r.fit_run_id,
         exp(r.home_advantage + hr.attack_strength - ar.defence_strength) as ph,
         exp(ar.attack_strength - hr.defence_strength) as pa
    from tgt t
    join public.model_fit_runs r
      on r.league_id = t.league_id and r.status = 'accepted'
     and r.fit_run_id not in (4, 5)
     and r.fitted_at::date < t.kickoff_date
    join public.team_ratings hr on hr.fit_run_id = r.fit_run_id and hr.team_id = t.home_team_id
    join public.team_ratings ar on ar.fit_run_id = r.fit_run_id and ar.team_id = t.away_team_id
   order by t.fixture_id, r.fitted_at desc
),
logged as (
  insert into public.prediction_corrections
    (fixture_id, reason, old_fit_run_id, old_model_version, old_predicted_home_goals, old_predicted_away_goals, old_predicted_at,
     new_fit_run_id, new_model_version, new_predicted_home_goals, new_predicted_away_goals)
  select t.fixture_id,
         case when c.fixture_id is null
              then 'Hindsight prediction removed: fit #' || t.prediction_fit_run_id || ' retired (legacy_pre_v1) and no accepted fit dated before kick-off rates both teams'
              else 'Predicted from fit #' || t.prediction_fit_run_id || ', retired with legacy_pre_v1 (scoring level sound); re-predicted point-in-time' end,
         t.prediction_fit_run_id, t.prediction_model_version, t.predicted_home_goals, t.predicted_away_goals, t.predicted_at,
         c.fit_run_id, case when c.fixture_id is null then null else 'dc_baseline_v1' end, c.ph, c.pa
    from tgt t left join chosen c using (fixture_id)
  returning fixture_id
)
update public.fixtures f
   set prediction_fit_run_id    = c.fit_run_id,
       predicted_home_goals     = c.ph,
       predicted_away_goals     = c.pa,
       raw_predicted_home_goals = c.ph,
       raw_predicted_away_goals = c.pa,
       prediction_model_version = case when c.fixture_id is null then null else 'dc_baseline_v1' end,
       predicted_at             = case when c.fixture_id is null then null else now() end
  from tgt t left join chosen c using (fixture_id)
 where f.fixture_id = t.fixture_id
   and t.fixture_id in (select fixture_id from logged);

update public.model_fit_runs
   set status = 'rejected',
       rejection_reason = coalesce(rejection_reason || ' | ', '')
         || 'Retired 2026-10-22 with the legacy_pre_v1 version (retired 2026-09-23). Its scoring level is sound (implied '
         || case fit_run_id when 4 then '2.51 goals a game, League One' else '2.56 goals a game, League Two' end
         || '), but no fit of a retired version should serve predictions. Fixture predictions made from it were re-predicted point-in-time (prediction_corrections).'
 where fit_run_id in (4, 5) and status = 'accepted';

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select date '2026-10-22', 'fit',
       'League One and League Two: last legacy_pre_v1 fits retired',
       'Audit 2026-10-22 (DQ-10): fits #4 (E2) and #5 (E3) were still accepted after legacy_pre_v1 was retired on 23 Sep, and 80 played 2026/27 fixtures (E2 36, E3 44) showed predictions from them written after kick-off.',
       'Fixtures re-predicted with dc_baseline_v1 from the newest accepted fit dated before kick-off that rates both teams (E2: retro-fits 396-400, mean 2.68 goals a game, was 2.49; E3: retro-fit 921, 2.57, was 2.62). Old values in prediction_corrections. Fits #4 and #5 set to rejected. Their scoring level was not biased, unlike #2, #3 and #6.',
       'legacy_pre_v1', 'dc_v1', 'migration 20261022140000'
 where not exists (select 1 from public.model_change_log where reference = 'migration 20261022140000');
