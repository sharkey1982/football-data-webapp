-- Point-in-time retro-fits: a fit "as of" a past date, labelled as such.
alter table public.model_fit_runs
  add column if not exists as_of_date date,
  add column if not exists is_retrofit boolean not null default false;

comment on column public.model_fit_runs.as_of_date is
  'Last match date the fit could see. Live fits: the run date. Retro-fits: the as-of date, with fitted_at = that date 23:59:59 UTC so the fit only serves kick-offs from the next day.';
comment on column public.model_fit_runs.is_retrofit is
  'True when the fit was produced later with --as-of (today''s code, point-in-time data), not at the time.';

create unique index if not exists model_fit_runs_one_accepted_retrofit_per_day
  on public.model_fit_runs (league_id, as_of_date)
  where is_retrofit and status = 'accepted';

-- Predictions for archived matches (past seasons live in matches, not fixtures).
create table if not exists public.match_predictions (
  match_id bigint primary key references public.matches(match_id) on delete cascade,
  fit_run_id bigint not null references public.model_fit_runs(fit_run_id),
  fit_as_of_date date not null,
  predicted_home_goals double precision not null,
  predicted_away_goals double precision not null,
  predicted_at timestamptz not null default now()
);
create index if not exists match_predictions_fit_run_idx on public.match_predictions(fit_run_id);

alter table public.match_predictions enable row level security;
drop policy if exists "match_predictions public read" on public.match_predictions;
create policy "match_predictions public read" on public.match_predictions for select using (true);
grant select on public.match_predictions to anon, authenticated;

-- Point-in-time: newest accepted fit whose fitted_at date is strictly before the match date,
-- exactly the rule backfill_historic_fixture_predictions uses for fixtures.
create or replace function public.backfill_match_predictions(p_league_id bigint, p_season_id bigint)
returns integer
language sql
security definer
set search_path = public
as $$
  with chosen as (
    select distinct on (m.match_id)
      m.match_id, m.home_team_id, m.away_team_id,
      mfr.fit_run_id, mfr.home_advantage, mfr.fitted_at
    from public.matches m
    join public.model_fit_runs mfr
      on mfr.league_id = m.league_id
     and mfr.status = 'accepted'
     and mfr.fitted_at::date < m.match_date::date
    where m.league_id = p_league_id
      and m.season_id = p_season_id
      and not exists (select 1 from public.match_predictions mp where mp.match_id = m.match_id)
    order by m.match_id, mfr.fitted_at desc
  ),
  ins as (
    insert into public.match_predictions (match_id, fit_run_id, fit_as_of_date, predicted_home_goals, predicted_away_goals)
    select c.match_id, c.fit_run_id, c.fitted_at::date,
           exp(c.home_advantage + hr.attack_strength - ar.defence_strength),
           exp(ar.attack_strength - hr.defence_strength)
    from chosen c
    join public.team_ratings hr on hr.fit_run_id = c.fit_run_id and hr.team_id = c.home_team_id
    join public.team_ratings ar on ar.fit_run_id = c.fit_run_id and ar.team_id = c.away_team_id
    on conflict (match_id) do nothing
    returning 1
  )
  select count(*)::integer from ins;
$$;
revoke all on function public.backfill_match_predictions(bigint, bigint) from public, anon, authenticated;
grant execute on function public.backfill_match_predictions(bigint, bigint) to service_role;
