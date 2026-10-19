-- Live definition exported from the database (function reconcile_unreported_played_fixtures()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.reconcile_unreported_played_fixtures()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with upd as (
    update public.fixtures f set status = 'postponed', updated_at = now()
    where f.status = 'played'
      and f.kickoff_date <= current_date - 3
      and f.reported_home_goals is null
      and not exists (select 1 from public.matches m
                      where m.league_id = f.league_id and m.season_id = f.season_id
                        and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
                        and m.match_date between f.kickoff_date - 3 and f.kickoff_date + 3)
      and exists (select 1 from public.matches m
                  where m.league_id = f.league_id and m.season_id = f.season_id
                    and m.match_date > f.kickoff_date + 1)
    returning 1)
  select count(*)::integer from upd
$function$
;
