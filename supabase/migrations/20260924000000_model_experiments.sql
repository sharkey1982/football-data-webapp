-- Point-in-time model experiments (scripts/model_experiment.py). Forecasts
-- only: experiment fits are made in memory and never written to
-- model_fit_runs, so no experiment can become a live fit.
create table if not exists public.model_experiment_predictions (
  experiment text not null,
  variant text not null,
  half_life_days double precision not null,
  shrinkage double precision not null,
  match_id bigint not null references public.matches(match_id) on delete cascade,
  as_of_date date not null,
  pred_home_goals double precision not null,
  pred_away_goals double precision not null,
  rho double precision not null,
  p_home double precision not null,
  p_draw double precision not null,
  p_away double precision not null,
  created_at timestamptz not null default now(),
  primary key (experiment, variant, match_id)
);
alter table public.model_experiment_predictions enable row level security;
drop policy if exists "model_experiment_predictions public read" on public.model_experiment_predictions;
create policy "model_experiment_predictions public read" on public.model_experiment_predictions for select using (true);
grant select on public.model_experiment_predictions to anon, authenticated;
grant select, insert, update, delete on public.model_experiment_predictions to service_role;

-- Scores every variant on the SAME matches (predicted by every variant, with
-- closing market-average odds); point-in-time guard on as_of_date.
create or replace function public.score_model_experiment(p_experiment text)
returns table(variant text, league_id bigint, season_id bigint, n bigint, ll_model numeric, ll_market numeric,
  p_draw numeric, draws bigint, pred_goals numeric, goals bigint)
language sql stable set search_path = public as $$
  with e as (select * from public.model_experiment_predictions where experiment = p_experiment),
  common as (select match_id from e group by match_id having count(distinct variant) = (select count(distinct variant) from e)),
  mk as (select o.match_id, 1/o.price_home ih, 1/o.price_draw id, 1/o.price_away ia from public.match_odds o
         where o.market = '1x2' and o.is_closing and o.bookmaker = 'Avg' and o.price_home > 1 and o.price_draw > 1 and o.price_away > 1)
  select e.variant, m.league_id, m.season_id, count(*),
    sum(-ln((case when m.full_time_home_goals > m.full_time_away_goals then e.p_home when m.full_time_home_goals = m.full_time_away_goals then e.p_draw else e.p_away end)::numeric)),
    sum(-ln(case when m.full_time_home_goals > m.full_time_away_goals then mk.ih when m.full_time_home_goals = m.full_time_away_goals then mk.id else mk.ia end / (mk.ih + mk.id + mk.ia))),
    sum(e.p_draw::numeric), count(*) filter (where m.full_time_home_goals = m.full_time_away_goals),
    sum((e.pred_home_goals + e.pred_away_goals)::numeric), sum(m.full_time_home_goals + m.full_time_away_goals)
  from e join common using (match_id) join public.matches m using (match_id) join mk using (match_id)
  where e.as_of_date < m.match_date::date
  group by 1, 2, 3;
$$;
grant execute on function public.score_model_experiment(text) to anon, authenticated;
