-- Live definition exported from the database (function intl_year_totals()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intl_year_totals()
 RETURNS TABLE(year integer, matches bigint, goals bigint, key_hash text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select extract(year from match_date)::int, count(*), sum(home_score + away_score),
         md5(string_agg(match_key, E'\n' order by match_key collate "C"))
  from intl.matches group by 1 order by 1
$function$
;
