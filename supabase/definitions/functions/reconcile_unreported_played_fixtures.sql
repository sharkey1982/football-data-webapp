-- Live definition exported from the database (function reconcile_unreported_played_fixtures()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.reconcile_unreported_played_fixtures()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- 2026-10-22 (DQ-03): never infers 'postponed' any more. Sweeps statuses
  -- into line (the fixtures trigger does this on every write; this catches
  -- rows no write has touched): kicked-off games without a result are
  -- awaiting_result, games with one are played.
  with a as (
    update public.fixtures f set status = 'awaiting_result', updated_at = now()
     where f.status = 'played' and f.reported_home_goals is null
       and not private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date)
    returning 1),
  b as (
    update public.fixtures f set status = 'played', updated_at = now()
     where f.status = 'awaiting_result'
       and (f.reported_home_goals is not null
            or private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date))
    returning 1)
  select ((select count(*) from a) + (select count(*) from b))::integer
$function$
;
