-- Live definition exported from the database (function get_price_predictor_record(p_season_id bigint, p_days integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_price_predictor_record(p_season_id bigint DEFAULT fpl_current_season_id(), p_days integer DEFAULT 28)
 RETURNS TABLE(from_night date, to_night date, nights integer, expected_rises integer, rose integer, expected_falls integer, fell integer, possible integer, possible_changed integer, rises integer, rises_expected integer, falls integer, falls_expected integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with r as (
    select * from public.fpl_price_predictor_nights
     where season_id = p_season_id
       and night > (select max(night) from public.fpl_price_predictor_nights where season_id = p_season_id) - greatest(p_days, 1))
  select min(night), max(night), count(distinct night)::int,
         count(*) filter (where progress >= 100)::int,
         count(*) filter (where progress >= 100 and price_after > price_before)::int,
         count(*) filter (where progress <= -100)::int,
         count(*) filter (where progress <= -100 and price_after < price_before)::int,
         count(*) filter (where abs(progress) < 100 and abs(coalesce(projected_next, 0)) >= 100)::int,
         count(*) filter (where abs(progress) < 100 and abs(coalesce(projected_next, 0)) >= 100
                            and sign(price_after - price_before) = sign(projected_next))::int,
         count(*) filter (where price_after > price_before)::int,
         count(*) filter (where price_after > price_before and progress >= 100)::int,
         count(*) filter (where price_after < price_before)::int,
         count(*) filter (where price_after < price_before and progress <= -100)::int
    from r;
$function$
;
