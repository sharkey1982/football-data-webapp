-- Live definition exported from the database (function get_strictest_referees()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_strictest_referees()
 RETURNS TABLE(referee text, red_cards bigint, matches bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select m.referee, sum(m.home_red_cards + m.away_red_cards)::bigint, count(*)::bigint
  from public.matches m
  where m.referee is not null and m.home_red_cards is not null
  group by m.referee
  having count(*) >= 50
  order by 2 desc
  limit 4;
$function$
;
