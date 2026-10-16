-- Live definition exported from the database (function current_season_id()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.current_season_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The football season in play today. If next season's seasons row has not
  -- been added by 1 July, this stays on the latest season that has started
  -- (so feeds keep working on the old season) and check_model_integrity()
  -- fails 'season_rollover_ready' until the row is added.
  select coalesce(
    public.season_id_for_date(current_date),
    (select s.season_id from public.seasons s
      where make_date(s.start_year, 7, 1) <= current_date
      order by s.start_year desc limit 1))
$function$
;
