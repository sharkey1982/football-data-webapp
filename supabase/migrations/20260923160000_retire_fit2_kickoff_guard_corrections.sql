-- Applied 2026-09-23. Fixes to live prediction integrity found while evaluating
-- the model against results (not model changes).

-- 1. Retire fit #2 (22 Jun 2026): its defence ratings use the opposite sign
--    convention (mean +0.172; every other fit -0.18 to -0.31), so the
--    prediction formula read it as ~2.0 goals a game.
update public.model_fit_runs
set status = 'rejected',
    rejection_reason = coalesce(rejection_reason || ' | ', '') ||
      'Retired 2026-09-23: defence ratings use the opposite sign convention to the prediction formula '
      || '(mean defence +0.172 vs -0.18..-0.31 in every other fit), so predictions from it average ~2.0 goals a game. '
      || 'Its 38 PL 2026/27 fixture predictions were re-predicted point-in-time (see prediction_corrections).'
where fit_run_id = 2 and league_id = 1 and status = 'accepted';

-- 2. Audit trail for predictions corrected after the fact.
create table if not exists public.prediction_corrections (
  correction_id bigint generated always as identity primary key,
  fixture_id bigint not null references public.fixtures(fixture_id),
  corrected_at timestamptz not null default now(),
  reason text not null,
  old_fit_run_id bigint, old_model_version text,
  old_predicted_home_goals double precision, old_predicted_away_goals double precision, old_predicted_at timestamptz,
  new_fit_run_id bigint, new_model_version text,
  new_predicted_home_goals double precision, new_predicted_away_goals double precision
);
alter table public.prediction_corrections enable row level security;
drop policy if exists "prediction_corrections public read" on public.prediction_corrections;
create policy "prediction_corrections public read" on public.prediction_corrections for select using (true);
grant select on public.prediction_corrections to anon, authenticated;
grant select, insert on public.prediction_corrections to service_role;

-- 3. Kick-off guard on live predictions (backfill_fixture_predictions): refresh a
--    fixture only from a fit dated strictly before its kick-off date -- the rule
--    every historic and retro prediction uses. Status alone let fixtures still
--    marked 'scheduled' after kick-off be re-predicted with hindsight (88 such
--    fixtures were exposed when this was applied).
do $$
declare
  fid oid := 'public.backfill_fixture_predictions()'::regprocedure;
  def text := pg_get_functiondef(fid);
  a1 text := 'select distinct on (league_id) league_id,fit_run_id,rho,home_advantage,window_start_date,window_end_date from public.model_fit_runs';
  a2 text := ' where f.status in(''scheduled'',''postponed'')
), preds as';
  n int;
begin
  if def ilike '%lf.fitted_at::date < f.kickoff_date%' then return; end if;  -- already applied
  n := (length(def) - length(replace(def, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'a1 matched %', n; end if;
  n := (length(def) - length(replace(def, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'a2 matched %', n; end if;
  def := replace(def, a1, 'select distinct on (league_id) league_id,fit_run_id,rho,home_advantage,window_start_date,window_end_date,fitted_at from public.model_fit_runs');
  def := replace(def, a2, ' where f.status in(''scheduled'',''postponed'')
   -- Kick-off guard (2026-09-23): never refresh from a fit dated on/after kick-off.
   and lf.fitted_at::date < f.kickoff_date
), preds as');
  execute def;
end $$;

-- 4. Data correction, run once after retro-fits as of 2026-08-20/27, 09-03, 09-10
--    (workflow retrofit-season, season 13): 43 played 2026/27 fixtures (41 PL
--    from fit #2 or a fit dated on/after kick-off; 2 Championship same-day)
--    re-predicted with plain Dixon-Coles from the newest accepted fit dated
--    before kick-off that rates both teams; old values in prediction_corrections.
--    Not re-runnable as a migration; the statement is kept in the PR description.
