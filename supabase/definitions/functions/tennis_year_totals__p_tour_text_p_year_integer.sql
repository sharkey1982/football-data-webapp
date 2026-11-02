-- Live definition exported from the database (function tennis_year_totals(p_tour text, p_year integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.tennis_year_totals(p_tour text, p_year integer)
 RETURNS TABLE(matches bigint, games bigint, key_hash text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*),
         coalesce(sum((select coalesce(sum(g), 0) from unnest(m.w_games || m.l_games) g)), 0),
         md5(coalesce(string_agg(m.source_key, '#' order by m.source_key collate "C"), ''))
  from tennis.matches m where m.tour = p_tour and m.year = p_year
$function$
;
