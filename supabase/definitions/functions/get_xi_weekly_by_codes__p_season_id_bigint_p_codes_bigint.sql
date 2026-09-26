-- Live definition exported from the database (function get_xi_weekly_by_codes(p_season_id bigint, p_codes bigint[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_xi_weekly_by_codes(p_season_id bigint, p_codes bigint[])
 RETURNS TABLE(gameweek integer, total_points integer, players_returning integer, blanks integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with weekly as (
    -- completed seasons: the imported history, keyed by player code
    select h.gameweek, h.total_points, h.minutes
    from public.fpl_player_gameweek_history h
    where h.season_id = p_season_id and h.fpl_code = any(p_codes)
    union all
    -- the season in progress: live rows, mapped to codes through fpl_players
    select g.fpl_event_id as gameweek, g.total_points, g.minutes
    from public.fpl_player_gameweeks g
    join public.fpl_players p
      on p.fpl_player_id = g.fpl_player_id and p.season_id = g.season_id
    where g.season_id = p_season_id and p.fpl_code = any(p_codes)
  )
  select gameweek::integer,
         sum(total_points)::integer,
         count(*) filter (where minutes > 0)::integer,
         count(*) filter (where minutes = 0)::integer
  from weekly
  group by gameweek
  order by gameweek;
$function$
;
