-- Live definition exported from the database (function history_record_matches(p_league_id bigint, p_limit integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.history_record_matches(p_league_id bigint, p_limit integer DEFAULT 10)
 RETURNS TABLE(record text, rank integer, match_id bigint, season_id bigint, start_year integer, match_date date, home_team_id bigint, away_team_id bigint, home_goals integer, away_goals integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  (
    select 'biggest_win'::text, (rank() over (order by m.margin desc))::int,
      m.match_id, m.season_id, m.start_year, m.match_date, m.home_team_id, m.away_team_id, m.home_goals, m.away_goals
    from public.history_league_matches m
    where m.league_id = p_league_id
    order by m.margin desc, m.total_goals desc, m.match_date
    limit least(greatest(p_limit, 1), 100)
  )
  union all
  (
    select 'highest_scoring'::text, (rank() over (order by m.total_goals desc))::int,
      m.match_id, m.season_id, m.start_year, m.match_date, m.home_team_id, m.away_team_id, m.home_goals, m.away_goals
    from public.history_league_matches m
    where m.league_id = p_league_id
    order by m.total_goals desc, m.margin desc, m.match_date
    limit least(greatest(p_limit, 1), 100)
  );
$function$
;
