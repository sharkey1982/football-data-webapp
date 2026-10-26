-- Live definition exported from the database (function season_id_for_date(p_date date)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.season_id_for_date(p_date date)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The season whose 1 July - 30 June window contains p_date (null if no
  -- seasons row covers it).
  select s.season_id from public.seasons s
   where p_date >= make_date(s.start_year, 7, 1)
     and p_date <  make_date(s.start_year + 1, 7, 1)
   order by s.start_year desc
   limit 1
$function$
;
