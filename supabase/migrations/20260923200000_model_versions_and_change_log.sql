-- Model versioning and change log (applied 2026-09-23). The seeded change-log
-- rows were inserted when this was applied; they are not repeated here so the
-- file stays safe to re-run.

-- 1. Early fits whose overall scoring level the prediction formula can't read.
--    Team ratings match later fits exactly (correlation 1.00) but defence
--    ratings sit ~0.37 higher across the board, so exp(ha + att - def)
--    predicts ~25% too few goals. NOT a sign reversal, as first recorded.
update public.model_fit_runs
set rejection_reason = 'Retired 2026-09-23: team ratings are correct (correlation 1.00 with later fits) but defence ratings are offset ~+0.37 '
  || 'relative to the prediction formula exp(ha + att - def), so predictions from it run ~25% low on goals (~2.0 a game). '
  || 'Its 2026/27 fixture predictions were re-predicted point-in-time (see prediction_corrections).'
where fit_run_id = 2;

update public.model_fit_runs
set status = 'rejected',
    rejection_reason = coalesce(rejection_reason || ' | ', '')
      || 'Retired 2026-09-23: same scoring-level offset as fit #2 -- implied '
      || case fit_run_id when 3 then '1.97 goals a game vs 2.61 actual (Championship)' else '2.27 vs 2.92 actual (National League)' end
      || '; predictions from it run ~25% low. Fixture predictions made from it are re-predicted point-in-time (prediction_corrections).'
where fit_run_id in (3, 6) and status = 'accepted';

-- 2. Model versions: the named settings behind every fit and prediction.
create table if not exists public.model_versions (
  version text primary key,
  component text not null check (component in ('fit', 'prediction')),
  description text not null,
  params jsonb not null default '{}'::jsonb,
  introduced_at date,
  retired_at date
);
alter table public.model_versions enable row level security;
drop policy if exists "model_versions public read" on public.model_versions;
create policy "model_versions public read" on public.model_versions for select using (true);
grant select on public.model_versions to anon, authenticated;

insert into public.model_versions (version, component, description, params, introduced_at, retired_at) values
 ('legacy_pre_v1', 'fit',
  'The first fits (22 June 2026, and one rejected fit on 13 September). Team ratings are sound, but most carry the overall scoring level in a way the prediction formula does not read, so predictions from them run about 25% low on goals. League One and League Two (fits #4, #5) are unaffected.',
  '{"window_days": 730, "half_life_days": 180}'::jsonb, '2026-06-22', '2026-09-23'),
 ('dc_v1', 'fit',
  'Dixon-Coles fit by scripts/fit_dixon_coles.py: time-weighted maximum likelihood over each league''s own full-time scores. Promoted and relegated teams without enough matches are estimated from the adjacent division by the median gap between divisions.',
  '{"window_days": 730, "half_life_days": 180, "min_matches_for_direct_fit": 10, "min_matches_for_production": 50, "strength_bound": 2.5, "movement_warning": 1.0, "rho": "estimated", "home_advantage": "one per league, estimated", "promoted_relegated_method": "median division gap (estimate_promoted_team_ratings.py)"}'::jsonb,
  '2026-09-13', null),
 ('dc_baseline_v1', 'prediction',
  'Goals from a fit''s ratings alone: exp(home advantage + home attack - away defence), and exp(away attack - home defence). Used for every retro-fit prediction and for corrected predictions.',
  '{}'::jsonb, '2026-09-13', null),
 ('dc_home_away_sparse_shrink_v2', 'prediction',
  'Live Premier League predictions: dc_baseline_v1 plus team-specific home/away adjustments, shrinkage for teams with few matches, and any manual strength overrides. Not yet evaluated point-in-time; its home/away adjustments are computed from current data.',
  '{}'::jsonb, '2026-09-13', null)
on conflict (version) do nothing;

alter table public.model_fit_runs add column if not exists model_version text references public.model_versions(version);
update public.model_fit_runs set model_version = 'legacy_pre_v1' where fit_run_id between 2 and 7 and model_version is null;
update public.model_fit_runs set model_version = 'dc_v1'
where model_version is null and fit_run_id > 7 and decay_half_life_days = 180 and window_end_date - window_start_date = 730;
comment on column public.model_fit_runs.model_version is
  'Settings version that produced this fit (model_versions). NULL = produced outside a named version (e.g. fit #38, a 619-day window run).';

-- 3. Change log. New entries are added by migration in the same PR as the
--    change, with the reason and before/after evidence.
create table if not exists public.model_change_log (
  change_id bigint generated always as identity primary key,
  changed_at date not null,
  area text not null check (area in ('fit', 'prediction', 'returns', 'data')),
  title text not null,
  reason text not null,
  detail text,
  before_metrics jsonb,
  after_metrics jsonb,
  version_from text,
  version_to text,
  reference text
);
alter table public.model_change_log enable row level security;
drop policy if exists "model_change_log public read" on public.model_change_log;
create policy "model_change_log public read" on public.model_change_log for select using (true);
grant select on public.model_change_log to anon, authenticated;
