-- Live definition exported from the database (function get_betting_bets(p_edge numeric, p_market text, p_closing boolean, p_best_price boolean, p_stake numeric, p_season_id bigint, p_league_id bigint, p_promoted text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_betting_bets(p_edge numeric DEFAULT 0.05, p_market text DEFAULT '1x2'::text, p_closing boolean DEFAULT true, p_best_price boolean DEFAULT true, p_stake numeric DEFAULT 10, p_season_id bigint DEFAULT 13, p_league_id bigint DEFAULT NULL::bigint, p_promoted text DEFAULT 'all'::text)
 RETURNS TABLE(match_id bigint, match_date date, home_team text, away_team text, home_goals integer, away_goals integer, selection text, model_p numeric, price numeric, edge numeric, won boolean, stake numeric, profit numeric, prices jsonb, predicted_from date, retrofit boolean, league_id bigint, league_name text, home_promoted boolean, away_promoted boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
-- Price basis (p_best_price):
--   true  -> highest price on file: every bookmaker row plus the market 'Max'
--            row ('Max' is not always highest -- Pinnacle's close can beat it)
--   false -> the 'Avg' row: market average price
-- 'Max' and 'Avg' are NOT bookmakers; before 2026-09-23 "median" was the
-- median of Avg, Max and two or three real books together.
declare max_p numeric;
begin
  if p_promoted not in ('all', 'exclude', 'only') then
    raise exception 'p_promoted must be all, exclude or only (got %)', p_promoted;
  end if;
  -- fixture_derived_markets returns PERCENTAGES; if that ever changes, the
  -- /100 below would silently bet on everything, so check it.
  select max(greatest(home_win, draw, away_win)) into max_p from public.fixture_derived_markets(1.6, 1.1, -0.1);
  if max_p is null or max_p <= 1.5 then
    raise exception 'fixture_derived_markets no longer returns percentages (max %), so the /100 here is wrong', max_p;
  end if;

  return query
  with played as materialized (
    select f.predicted_home_goals::numeric as lh, f.predicted_away_goals::numeric as la,
           coalesce(mfr.rho, 0)::numeric as rho, m.match_id, m.match_date::date as md,
           m.home_team_id, m.away_team_id, m.league_id as lg, m.season_id as sid,
           m.full_time_home_goals as hg, m.full_time_away_goals as ag,
           mfr.fitted_at::date as pf, coalesce(mfr.is_retrofit, false) as rf
    from public.fixtures f
    join public.matches m
      on m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
     and m.match_date::date = f.kickoff_date::date
    left join public.model_fit_runs mfr on mfr.fit_run_id = f.prediction_fit_run_id
    where f.season_id = p_season_id and f.status = 'played'
      and f.predicted_home_goals is not null and m.full_time_home_goals is not null
    union all
    select mp.predicted_home_goals::numeric, mp.predicted_away_goals::numeric,
           coalesce(mfr2.rho, 0)::numeric, m2.match_id, m2.match_date::date,
           m2.home_team_id, m2.away_team_id, m2.league_id, m2.season_id,
           m2.full_time_home_goals, m2.full_time_away_goals,
           mp.fit_as_of_date, coalesce(mfr2.is_retrofit, false)
    from public.match_predictions mp
    join public.matches m2 on m2.match_id = mp.match_id
    left join public.model_fit_runs mfr2 on mfr2.fit_run_id = mp.fit_run_id
    where m2.season_id = p_season_id and m2.full_time_home_goals is not null
      and not exists (
        select 1 from public.fixtures f2
        where f2.season_id = p_season_id and f2.status = 'played'
          and f2.predicted_home_goals is not null
          and f2.home_team_id = m2.home_team_id and f2.away_team_id = m2.away_team_id
          and f2.kickoff_date::date = m2.match_date::date)
  ),
  rows_ as materialized (
    select o.* from public.match_odds o
    where o.match_id in (select pl.match_id from played pl)
      and o.market = p_market and (o.is_closing = p_closing or o.is_closing is null)
  ),
  prices as materialized (
    select o.match_id,
      case when p_best_price then max(o.price_home) else max(o.price_home) filter (where o.bookmaker = 'Avg') end as price_home,
      case when p_best_price then max(o.price_draw) else max(o.price_draw) filter (where o.bookmaker = 'Avg') end as price_draw,
      case when p_best_price then max(o.price_away) else max(o.price_away) filter (where o.bookmaker = 'Avg') end as price_away,
      case when p_best_price then max(o.price_over) else max(o.price_over) filter (where o.bookmaker = 'Avg') end as price_over,
      case when p_best_price then max(o.price_under) else max(o.price_under) filter (where o.bookmaker = 'Avg') end as price_under,
      jsonb_object_agg(o.bookmaker, o.price_home) filter (where o.price_home is not null) as src_home,
      jsonb_object_agg(o.bookmaker, o.price_draw) filter (where o.price_draw is not null) as src_draw,
      jsonb_object_agg(o.bookmaker, o.price_away) filter (where o.price_away is not null) as src_away,
      jsonb_object_agg(o.bookmaker, o.price_over) filter (where o.price_over is not null) as src_over,
      jsonb_object_agg(o.bookmaker, o.price_under) filter (where o.price_under is not null) as src_under
    from rows_ o group by o.match_id
  ),
  markets as (
    select pl.*, pr.price_home, pr.price_draw, pr.price_away, pr.price_over, pr.price_under,
           pr.src_home, pr.src_draw, pr.src_away, pr.src_over, pr.src_under,
           dm.home_win / 100.0 as home_win, dm.draw / 100.0 as draw, dm.away_win / 100.0 as away_win,
           dm.over_2_5 / 100.0 as over_2_5, dm.under_2_5 / 100.0 as under_2_5
    from played pl join prices pr on pr.match_id = pl.match_id
    cross join lateral public.fixture_derived_markets(pl.lh, pl.la, pl.rho) dm
  ),
  candidates as (
    select mk.*, 'Home'::text as sel, mk.home_win::numeric as mp_, mk.price_home as px, (mk.hg > mk.ag) as w, mk.src_home as src from markets mk where p_market='1x2' and mk.price_home is not null
    union all select mk.*, 'Draw', mk.draw::numeric, mk.price_draw, (mk.hg = mk.ag), mk.src_draw from markets mk where p_market='1x2' and mk.price_draw is not null
    union all select mk.*, 'Away', mk.away_win::numeric, mk.price_away, (mk.ag > mk.hg), mk.src_away from markets mk where p_market='1x2' and mk.price_away is not null
    union all select mk.*, 'Over 2.5', mk.over_2_5::numeric, mk.price_over, (mk.hg + mk.ag > 2.5), mk.src_over from markets mk where p_market='ou25' and mk.price_over is not null
    union all select mk.*, 'Under 2.5', mk.under_2_5::numeric, mk.price_under, (mk.hg + mk.ag < 2.5), mk.src_under from markets mk where p_market='ou25' and mk.price_under is not null
  )
  select c.match_id, c.md, ht.canonical_name, at.canonical_name, c.hg, c.ag,
         c.sel, c.mp_, c.px, c.mp_ - (1.0 / c.px), c.w, p_stake,
         case when c.w then p_stake * c.px - p_stake else -p_stake end,
         c.src, c.pf, c.rf,
         c.lg, lgn.name, coalesce(hm.is_promoted, false), coalesce(am.is_promoted, false)
  from candidates c
  join public.teams ht on ht.team_id = c.home_team_id
  join public.teams at on at.team_id = c.away_team_id
  join public.leagues lgn on lgn.league_id = c.lg
  -- Promoted: arrived from a lower division this season (team_season_movement).
  left join public.team_season_movement hm on hm.team_id = c.home_team_id and hm.league_id = c.lg and hm.season_id = c.sid
  left join public.team_season_movement am on am.team_id = c.away_team_id and am.league_id = c.lg and am.season_id = c.sid
  where c.px > 1 and c.mp_ between 0 and 1 and c.mp_ - (1.0 / c.px) >= p_edge
    and (p_league_id is null or c.lg = p_league_id)
    and (p_promoted = 'all'
      or (p_promoted = 'exclude' and not (coalesce(hm.is_promoted, false) or coalesce(am.is_promoted, false)))
      or (p_promoted = 'only' and (coalesce(hm.is_promoted, false) or coalesce(am.is_promoted, false))))
  order by c.md, ht.canonical_name, c.sel;
end $function$
;
