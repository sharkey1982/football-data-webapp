-- Live definition exported from the database (function get_overround_trend(p_bookmaker text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_overround_trend(p_bookmaker text DEFAULT 'Avg'::text)
 RETURNS TABLE(season_label text, league_code text, matches bigint, overround numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select s.label, l.code, count(*)::bigint,
    round(avg(1/o.price_home + 1/o.price_draw + 1/o.price_away)::numeric, 4)
  from public.match_odds o
  join public.matches m on m.match_id = o.match_id
  join public.seasons s on s.season_id = m.season_id
  join public.leagues l on l.league_id = m.league_id
  where o.market = '1x2'
    and o.bookmaker = p_bookmaker
    and o.is_closing
    and o.price_home is not null and o.price_draw is not null and o.price_away is not null
  group by s.label, l.code
  -- A part-played season or a thin division reads as a spike otherwise.
  having count(*) >= 100
  order by s.label, l.code;
$function$
;
