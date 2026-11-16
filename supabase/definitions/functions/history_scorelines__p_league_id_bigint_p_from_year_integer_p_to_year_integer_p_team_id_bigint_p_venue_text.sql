-- Live definition exported from the database (function history_scorelines(p_league_id bigint, p_from_year integer, p_to_year integer, p_team_id bigint, p_venue text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.history_scorelines(p_league_id bigint, p_from_year integer DEFAULT NULL::integer, p_to_year integer DEFAULT NULL::integer, p_team_id bigint DEFAULT NULL::bigint, p_venue text DEFAULT NULL::text)
 RETURNS TABLE(goals_a integer, goals_b integer, outcome text, matches bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select least(s.goals_for, 5), least(s.goals_against, 5), s.result, count(*)
  from public.team_match_snapshot s
  join public.seasons se using (season_id)
  where s.league_id = p_league_id
    and (p_from_year is null or se.start_year >= p_from_year)
    and (p_to_year is null or se.start_year <= p_to_year)
    and case
          when p_team_id is null then s.venue = 'H'
          else s.team_id = p_team_id and (p_venue is null or s.venue = p_venue)
        end
  group by 1, 2, 3
  order by 1, 2, 3;
$function$
;
