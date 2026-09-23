-- service_role had no table grant on match_predictions: the retrofit
-- workflow's coverage read got a 403.
grant select, insert, update, delete on public.match_predictions to service_role;

-- A single-date test run filled the whole season from the pre-season fit,
-- and the fill-only-if-missing version could never replace those.
delete from public.match_predictions;

-- Converges: each match takes the newest accepted fit before it that rates
-- BOTH teams, and a rerun replaces any prediction that isn't that fit. So a
-- partial run followed by a full one can never leave stale predictions behind.
create or replace function public.backfill_match_predictions(p_league_id bigint, p_season_id bigint)
returns integer
language sql
security definer
set search_path = public
as $$
  with chosen as (
    select distinct on (m.match_id)
      m.match_id, mfr.fit_run_id, mfr.fitted_at,
      exp(mfr.home_advantage + hr.attack_strength - ar.defence_strength) as ph,
      exp(ar.attack_strength - hr.defence_strength) as pa
    from public.matches m
    join public.model_fit_runs mfr
      on mfr.league_id = m.league_id
     and mfr.status = 'accepted'
     and mfr.fitted_at::date < m.match_date::date
    join public.team_ratings hr on hr.fit_run_id = mfr.fit_run_id and hr.team_id = m.home_team_id
    join public.team_ratings ar on ar.fit_run_id = mfr.fit_run_id and ar.team_id = m.away_team_id
    where m.league_id = p_league_id
      and m.season_id = p_season_id
    order by m.match_id, mfr.fitted_at desc
  ),
  up as (
    insert into public.match_predictions as mp
      (match_id, fit_run_id, fit_as_of_date, predicted_home_goals, predicted_away_goals)
    select match_id, fit_run_id, fitted_at::date, ph, pa from chosen
    on conflict (match_id) do update
      set fit_run_id = excluded.fit_run_id,
          fit_as_of_date = excluded.fit_as_of_date,
          predicted_home_goals = excluded.predicted_home_goals,
          predicted_away_goals = excluded.predicted_away_goals,
          predicted_at = now()
      where mp.fit_run_id is distinct from excluded.fit_run_id
    returning 1
  )
  select count(*)::integer from up;
$$;
revoke all on function public.backfill_match_predictions(bigint, bigint) from public, anon, authenticated;
grant execute on function public.backfill_match_predictions(bigint, bigint) to service_role;
