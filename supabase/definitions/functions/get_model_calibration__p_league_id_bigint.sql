-- Live definition exported from the database (function get_model_calibration(p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_model_calibration(p_league_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(band text, forecasts integer, mean_predicted numeric, actual_rate numeric, gap numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with forecasts as (
    select unnest(array[a.p_home, a.p_draw, a.p_away]) as p,
           unnest(array[
             (a.actual = 'H')::int, (a.actual = 'D')::int, (a.actual = 'A')::int
           ]) as hit
    from public.get_model_accuracy(p_league_id) a
  ),
  banded as (
    select case
      when p < 10 then '0-10'   when p < 20 then '10-20'
      when p < 30 then '20-30'  when p < 40 then '30-40'
      when p < 50 then '40-50'  when p < 60 then '50-60'
      else '60+' end as band,
      p, hit
    from forecasts
  )
  select band, count(*)::int, round(avg(p),1), round(100.0*sum(hit)/count(*),1),
         round(100.0*sum(hit)/count(*) - avg(p), 1)
  from banded group by band
  order by case band when '0-10' then 1 when '10-20' then 2 when '20-30' then 3
                     when '30-40' then 4 when '40-50' then 5 when '50-60' then 6 else 7 end;
$function$
;
