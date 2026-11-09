-- Live definition exported from the database (function penalty_match_team(p_name text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.penalty_match_team(p_name text)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select t.team_id from public.teams t
   where lower(t.display_name) = lower(p_name) or lower(t.canonical_name) = lower(p_name)
      or exists (select 1 from public.team_aliases a where a.team_id = t.team_id and lower(a.raw_name) = lower(p_name))
   order by (exists (select 1 from public.fixtures f where f.league_id = 1 and f.season_id = 13 and t.team_id in (f.home_team_id, f.away_team_id))) desc,
            t.team_id
   limit 1
$function$
;
