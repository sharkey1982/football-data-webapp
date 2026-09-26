-- Live definition exported from the database (function fpl_gameweek_for_date(p_season_id bigint, p_date date)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_gameweek_for_date(p_season_id bigint, p_date date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select max(fpl_event_id)::integer
  from public.fpl_gameweeks
  where season_id = p_season_id
    and (deadline_time at time zone 'Europe/London')::date < p_date;
$function$
;
