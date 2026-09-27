-- Live definition exported from the database (function get_market_efficiency(p_bookmaker text, p_closing boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_market_efficiency(p_bookmaker text DEFAULT 'Avg'::text, p_closing boolean DEFAULT true)
 RETURNS TABLE(league_code text, league_name text, market text, matches bigint, overround numeric, roi_favourite numeric, roi_outsider numeric, roi_home numeric, roi_draw numeric, roi_away numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with q as (
    select l.code, l.name, o.market, m.league_id, m.season_id,
      o.price_home, o.price_draw, o.price_away,
      m.full_time_result res
    from public.match_odds o
    join public.matches m on m.match_id = o.match_id
    join public.leagues l on l.league_id = m.league_id
    where o.market = '1x2'
      and o.bookmaker = p_bookmaker
      and o.is_closing = p_closing
      and o.price_home is not null and o.price_draw is not null and o.price_away is not null
      and m.full_time_result is not null
  ),
  tagged as (
    select *,
      -- Favourite/outsider by price, which is how the market itself
      -- ranks them -- not by home/away, which confounds the two.
      least(price_home, price_draw, price_away) as fav_price,
      greatest(price_home, price_draw, price_away) as dog_price,
      case
        when price_home <= price_draw and price_home <= price_away then 'H'
        when price_away <= price_home and price_away <= price_draw then 'A'
        else 'D'
      end as fav_outcome,
      case
        when price_home >= price_draw and price_home >= price_away then 'H'
        when price_away >= price_home and price_away >= price_draw then 'A'
        else 'D'
      end as dog_outcome
    from q
  )
  select code,
    -- The division's name(s) over the seasons pooled here, oldest first.
    (select string_agg(e.era_name, ' / ' order by e.first_year)
       from (select public.league_name_for_season(x.league_id, x.season_id) era_name, min(s.start_year) first_year
               from (select distinct t2.league_id, t2.season_id from tagged t2 where t2.code = tagged.code) x
               join public.seasons s on s.season_id = x.season_id
              group by 1) e),
    market, count(*)::bigint,
    round(avg(1/price_home + 1/price_draw + 1/price_away)::numeric, 4),
    round(100 * (sum(case when res = fav_outcome then fav_price - 1 else -1 end) / count(*))::numeric, 2),
    round(100 * (sum(case when res = dog_outcome then dog_price - 1 else -1 end) / count(*))::numeric, 2),
    round(100 * (sum(case when res = 'H' then price_home - 1 else -1 end) / count(*))::numeric, 2),
    round(100 * (sum(case when res = 'D' then price_draw - 1 else -1 end) / count(*))::numeric, 2),
    round(100 * (sum(case when res = 'A' then price_away - 1 else -1 end) / count(*))::numeric, 2)
  from tagged
  group by code, name, market
  order by code;
$function$
;
