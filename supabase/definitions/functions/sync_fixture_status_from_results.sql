-- Live definition exported from the database (function sync_fixture_status_from_results()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sync_fixture_status_from_results()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with upd as (
    update public.fixtures f set status = 'played', updated_at = now()
    where f.status in ('scheduled', 'postponed')
      and f.kickoff_date < current_date
      and exists (select 1 from public.matches m
                  where m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
                    and m.match_date::date = f.kickoff_date and m.full_time_home_goals is not null)
    returning 1)
  select count(*)::integer from upd;
$function$
;
