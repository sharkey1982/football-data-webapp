-- ============================================================================
-- What the model's predictions would have returned as bets.
--
-- A BET is placed when the model's probability beats the price's implied
-- probability (1/odds) by at least p_edge. The comparison uses the RAW
-- implied probability, MARGIN INCLUDED: a market's prices sum to ~105%, and
-- that cut is exactly what a bettor has to beat, so it counts against the
-- model here rather than being normalised away.
--
--   p_best_price  the best of the available bookmakers (realistic only if you
--                 hold every account) or the median (closer to one account)
--   p_closing     settle at closing prices (beating the close is the usual
--                 test of a real edge) or at the earliest observed price
--   flat stakes   Kelly amplifies both skill and luck and needs a far larger
--                 sample to read, so it is not the default
--
-- Two traps found while building this, both of which produced confident
-- nonsense before being caught:
--   * fixture_derived_markets returns PERCENTAGES (47.77, not 0.4777), so the
--     first version computed edges of ~3,000% and bet on Home, Draw AND Away
--     in all 153 matches. Hence the /100 -- and the guard that raises if that
--     function ever stops returning percentages.
--   * grouping all 619k odds rows before filtering timed out; prices are now
--     restricted to the season's matches first.
-- ============================================================================
create or replace function public.get_betting_returns(
  p_edge numeric default 0.05, p_market text default '1x2', p_closing boolean default true,
  p_best_price boolean default true, p_stake numeric default 10, p_season_id bigint default 13)
returns table(
  selection text, bets integer, staked numeric, returned numeric, profit numeric,
  roi_pct numeric, wins integer, hit_rate_pct numeric, avg_odds numeric, avg_edge_pct numeric)
language plpgsql stable set search_path to 'public','pg_temp'
as $$
declare max_p numeric;
begin
  select max(greatest(home_win, draw, away_win)) into max_p from public.fixture_derived_markets(1.6, 1.1, -0.1);
  if max_p is null or max_p <= 1.5 then
    raise exception 'fixture_derived_markets no longer returns percentages (max %), so the /100 here is wrong', max_p;
  end if;

  return query
  with played as materialized (
    select f.predicted_home_goals::numeric as lh, f.predicted_away_goals::numeric as la,
           coalesce(mfr.rho, 0)::numeric as rho, m.match_id,
           m.full_time_home_goals as hg, m.full_time_away_goals as ag
    from public.fixtures f
    join public.matches m
      on m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
     and m.match_date::date = f.kickoff_date::date
    left join public.model_fit_runs mfr on mfr.fit_run_id = f.prediction_fit_run_id
    where f.season_id = p_season_id and f.status = 'played'
      and f.predicted_home_goals is not null and m.full_time_home_goals is not null
  ),
  prices as materialized (
    select o.match_id,
      (case when p_best_price then max(o.price_home) else (percentile_cont(0.5) within group (order by o.price_home))::numeric end)::numeric as price_home,
      (case when p_best_price then max(o.price_draw) else (percentile_cont(0.5) within group (order by o.price_draw))::numeric end)::numeric as price_draw,
      (case when p_best_price then max(o.price_away) else (percentile_cont(0.5) within group (order by o.price_away))::numeric end)::numeric as price_away,
      (case when p_best_price then max(o.price_over) else (percentile_cont(0.5) within group (order by o.price_over))::numeric end)::numeric as price_over,
      (case when p_best_price then max(o.price_under) else (percentile_cont(0.5) within group (order by o.price_under))::numeric end)::numeric as price_under
    from public.match_odds o
    where o.match_id in (select match_id from played)
      and o.market = p_market and (o.is_closing = p_closing or o.is_closing is null)
    group by o.match_id
  ),
  markets as (
    select pl.hg, pl.ag, pr.price_home, pr.price_draw, pr.price_away, pr.price_over, pr.price_under,
           dm.home_win / 100.0 as home_win, dm.draw / 100.0 as draw, dm.away_win / 100.0 as away_win,
           dm.over_2_5 / 100.0 as over_2_5, dm.under_2_5 / 100.0 as under_2_5
    from played pl join prices pr on pr.match_id = pl.match_id
    cross join lateral public.fixture_derived_markets(pl.lh, pl.la, pl.rho) dm
  ),
  candidates as (
    select 'Home'::text as selection, home_win::numeric as model_p, price_home as price, (hg > ag) as won from markets where p_market='1x2' and price_home is not null
    union all select 'Draw', draw::numeric, price_draw, (hg = ag) from markets where p_market='1x2' and price_draw is not null
    union all select 'Away', away_win::numeric, price_away, (ag > hg) from markets where p_market='1x2' and price_away is not null
    union all select 'Over 2.5', over_2_5::numeric, price_over, (hg + ag > 2.5) from markets where p_market='ou25' and price_over is not null
    union all select 'Under 2.5', under_2_5::numeric, price_under, (hg + ag < 2.5) from markets where p_market='ou25' and price_under is not null
  ),
  bets as (
    select c.selection, c.model_p, c.price, c.won, c.model_p - (1.0 / c.price) as edge
    from candidates c where c.price > 1 and c.model_p between 0 and 1 and c.model_p - (1.0 / c.price) >= p_edge
  )
  select b.selection, count(*)::integer,
    round((count(*) * p_stake)::numeric, 2),
    round(sum(case when b.won then p_stake * b.price else 0 end)::numeric, 2),
    round((sum(case when b.won then p_stake * b.price else 0 end) - count(*) * p_stake)::numeric, 2),
    round((100 * (sum(case when b.won then p_stake * b.price else 0 end) - count(*) * p_stake) / nullif(count(*) * p_stake, 0))::numeric, 1),
    count(*) filter (where b.won)::integer,
    round((100.0 * count(*) filter (where b.won) / nullif(count(*), 0))::numeric, 1),
    round(avg(b.price)::numeric, 2),
    round((100 * avg(b.edge))::numeric, 1)
  from bets b group by b.selection order by b.selection;
end $$;
comment on function public.get_betting_returns(numeric, text, boolean, boolean, numeric, bigint) is
  'What the model''s predictions would have returned as flat-stake bets, placed when the model beats the raw implied probability by p_edge.';
grant execute on function public.get_betting_returns(numeric, text, boolean, boolean, numeric, bigint) to anon, authenticated;
