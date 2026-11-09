-- Live definition exported from the database (function get_my_club_options()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_my_club_options()
 RETURNS TABLE(team_id bigint, name text, slug text, league_id bigint, league_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select distinct on (t.team_id) t.team_id, t.display_name, t.slug, l.league_id, l.name
    from public.fixtures f
    join public.teams t on t.team_id in (f.home_team_id, f.away_team_id)
    join public.leagues l on l.league_id = f.league_id
   where f.league_id in (1, 2, 3, 4, 5, 15, 22)
     and f.kickoff_date between (now() at time zone 'Europe/London')::date - 120 and (now() at time zone 'Europe/London')::date + 240
   order by t.team_id, f.kickoff_date desc
$function$
;
