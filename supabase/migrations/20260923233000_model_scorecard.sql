-- Model scorecard (applied 2026-09-23): per-match model vs closing-market 1X2
-- probabilities, refreshed twice daily; summed by the page for any filter.

create materialized view if not exists public.model_scorecard_matches as
with cur as (select max(season_id) s from public.matches where league_id between 1 and 5),
preds as (
  select m.match_id, m.league_id, m.season_id, m.match_date::date md, m.home_team_id, m.away_team_id,
         m.full_time_home_goals hg, m.full_time_away_goals ag,
         mp.predicted_home_goals::numeric lh, mp.predicted_away_goals::numeric la, mp.fit_run_id
  from public.match_predictions mp join public.matches m using (match_id)
  where m.season_id < (select s from cur) and m.full_time_home_goals is not null
  union all
  select m.match_id, m.league_id, m.season_id, m.match_date::date, m.home_team_id, m.away_team_id,
         m.full_time_home_goals, m.full_time_away_goals,
         f.predicted_home_goals::numeric, f.predicted_away_goals::numeric, f.prediction_fit_run_id
  from public.fixtures f
  join public.matches m on m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
   and m.match_date::date = f.kickoff_date and m.league_id = f.league_id
  where f.season_id = (select s from cur) and f.status = 'played' and f.predicted_home_goals is not null
    and m.full_time_home_goals is not null
),
mk as (
  select o.match_id, 1 / o.price_home ih, 1 / o.price_draw id, 1 / o.price_away ia
  from public.match_odds o
  where o.market = '1x2' and o.is_closing and o.bookmaker = 'Avg'
    and o.price_home > 1 and o.price_draw > 1 and o.price_away > 1
)
select p.match_id, p.league_id, p.season_id, p.md as match_date, p.fit_run_id, r.model_version,
  case
    when exists (select 1 from public.team_ratings t where t.fit_run_id = p.fit_run_id and t.team_id in (p.home_team_id, p.away_team_id) and t.is_estimated) then 'estimated'
    when exists (select 1 from public.team_season_movement v where v.season_id = p.season_id and v.league_id = p.league_id and v.team_id in (p.home_team_id, p.away_team_id) and v.movement = 'relegated') then 'relegated'
    when exists (select 1 from public.team_season_movement v where v.season_id = p.season_id and v.league_id = p.league_id and v.team_id in (p.home_team_id, p.away_team_id) and v.is_promoted) then 'promoted'
    else 'established'
  end as team_type,
  case when extract(month from p.md) in (7, 8, 9, 10) then '1 Aug-Oct'
       when extract(month from p.md) in (11, 12) then '2 Nov-Dec'
       when extract(month from p.md) in (1, 2, 3) then '3 Jan-Mar'
       else '4 Apr-May' end as phase,
  case when p.hg > p.ag then 'H' when p.hg = p.ag then 'D' else 'A' end as result,
  p.hg, p.ag, p.lh, p.la,
  dm.home_win / 100.0 as p_home, dm.draw / 100.0 as p_draw, dm.away_win / 100.0 as p_away,
  mk.ih / (mk.ih + mk.id + mk.ia) as m_home, mk.id / (mk.ih + mk.id + mk.ia) as m_draw, mk.ia / (mk.ih + mk.id + mk.ia) as m_away
from preds p
join mk using (match_id)
left join public.model_fit_runs r on r.fit_run_id = p.fit_run_id
cross join lateral public.fixture_derived_markets(p.lh, p.la, coalesce(r.rho, 0)::numeric) dm;

create unique index if not exists model_scorecard_matches_pk on public.model_scorecard_matches (match_id);
grant select on public.model_scorecard_matches to anon, authenticated, service_role;

create or replace function public.refresh_model_scorecard()
returns integer language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.model_scorecard_matches;
  return (select count(*)::integer from public.model_scorecard_matches);
end $$;
revoke all on function public.refresh_model_scorecard() from public, anon, authenticated;
grant execute on function public.refresh_model_scorecard() to service_role;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'refresh-model-scorecard') then
    perform cron.schedule('refresh-model-scorecard', '0 10,22 * * *', 'select public.refresh_model_scorecard();');
  end if;
end $$;

create or replace function public.get_model_scorecard()
returns table(league_id bigint, season_id bigint, team_type text, phase text, n bigint,
  ll_model numeric, ll_market numeric, brier_model numeric, brier_market numeric,
  p_draw numeric, m_draw numeric, draws bigint, pred_goals numeric, goals bigint)
language sql stable set search_path = public as $$
  select s.league_id, s.season_id, s.team_type, s.phase, count(*),
    sum(-ln(case s.result when 'H' then s.p_home when 'D' then s.p_draw else s.p_away end)),
    sum(-ln(case s.result when 'H' then s.m_home when 'D' then s.m_draw else s.m_away end)),
    sum((s.p_home - (s.result = 'H')::int)^2 + (s.p_draw - (s.result = 'D')::int)^2 + (s.p_away - (s.result = 'A')::int)^2),
    sum((s.m_home - (s.result = 'H')::int)^2 + (s.m_draw - (s.result = 'D')::int)^2 + (s.m_away - (s.result = 'A')::int)^2),
    sum(s.p_draw), sum(s.m_draw), count(*) filter (where s.result = 'D'),
    sum(s.lh + s.la), sum(s.hg + s.ag)
  from public.model_scorecard_matches s
  group by 1, 2, 3, 4;
$$;

-- Named to avoid the existing get_model_calibration(bigint) (see docs/incidents.md).
create or replace function public.get_model_scorecard_calibration()
returns table(league_id bigint, season_id bigint, outcome text, bin integer, n bigint, predicted numeric, happened bigint)
language sql stable set search_path = public as $$
  with o as (
    select s.league_id, s.season_id, 'Home'::text outcome, s.p_home p, (s.result = 'H') hit from public.model_scorecard_matches s
    union all select s.league_id, s.season_id, 'Draw', s.p_draw, s.result = 'D' from public.model_scorecard_matches s
    union all select s.league_id, s.season_id, 'Away', s.p_away, s.result = 'A' from public.model_scorecard_matches s)
  select o.league_id, o.season_id, o.outcome, least(9, floor(o.p * 10))::int, count(*), sum(o.p), count(*) filter (where o.hit)
  from o group by 1, 2, 3, 4;
$$;
grant execute on function public.get_model_scorecard() to anon, authenticated;
grant execute on function public.get_model_scorecard_calibration() to anon, authenticated;

-- Guard: no duplicate public function names (added to check_model_integrity).
do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  anchor text := 'and kickoff_date < current_date - 3) x;';
  n int;
begin
  if def ilike '%unique_function_names%' then return; end if;
  n := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
  if n <> 1 then raise exception 'anchor matched % times', n; end if;
  execute replace(def, anchor, 'and kickoff_date < current_date - 3) x
  union all
  select ''unique_function_names'', case when n = 0 then ''ok'' else ''failed'' end, n,
    ''Public function names defined more than once (an ambiguous call breaks the site): '' || coalesce(names, '''')
  from (select count(*) n, string_agg(proname, '', '') names from (
          select p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = ''public'' and p.prokind = ''f''
            and not exists (select 1 from pg_depend d where d.classid = ''pg_proc''::regclass and d.objid = p.oid and d.deptype = ''e'')
          group by p.proname having count(*) > 1) q) x;');
end $$;
