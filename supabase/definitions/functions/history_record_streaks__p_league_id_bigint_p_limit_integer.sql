-- Live definition exported from the database (function history_record_streaks(p_league_id bigint, p_limit integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.history_record_streaks(p_league_id bigint, p_limit integer DEFAULT 10)
 RETURNS TABLE(streak_type text, rank integer, team_id bigint, length integer, start_date date, end_date date, start_season_id bigint, end_season_id bigint, ongoing boolean, truncated_start boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select x.streak_type, x.rk::int, x.team_id, x.length, x.start_date, x.end_date,
    x.start_season_id, x.end_season_id, x.ongoing, x.truncated_start
  from (
    select h.*,
      rank() over (partition by h.streak_type order by h.length desc) as rk,
      row_number() over (partition by h.streak_type order by h.length desc, h.start_date) as rn
    from public.history_streaks h
    where h.league_id = p_league_id
  ) x
  where x.rn <= least(greatest(p_limit, 1), 100)
  order by x.streak_type, x.rn;
$function$
;
