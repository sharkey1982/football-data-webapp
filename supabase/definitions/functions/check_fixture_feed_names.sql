-- Live definition exported from the database (function check_fixture_feed_names()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_fixture_feed_names()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'fixture_feed_names_mapped',
    case when count(*) = 0 then 'ok' else 'failed' end,
    count(*),
    'Current-season E0-E3 fixtures not refreshed by the FixtureDownload feed for 3+ days (an unmapped team name in team_aliases?): '
      || coalesce(array_to_string((array_agg(l.code || ' ' || ht.canonical_name || ' v ' || at.canonical_name order by f.kickoff_date))[1:10], ', '), '')
  from public.fixtures f
  join public.leagues l on l.league_id = f.league_id
  join public.teams ht on ht.team_id = f.home_team_id
  join public.teams at on at.team_id = f.away_team_id
  where l.code in ('E0', 'E1', 'E2', 'E3')
    and f.season_id = public.current_season_id()
    and f.updated_at < now() - interval '3 days'
$function$
;
