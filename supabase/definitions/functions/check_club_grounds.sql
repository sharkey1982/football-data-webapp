-- Live definition exported from the database (function check_club_grounds()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_club_grounds()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'club_grounds_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Clubs playing in the top five English divisions since 1 July with no row in club_grounds'
  from (select count(distinct t.team_id) n
        from public.matches m
        join public.leagues l on l.league_id = m.league_id and l.code in ('E0', 'E1', 'E2', 'E3', 'EC')
        join public.teams t on t.team_id in (m.home_team_id, m.away_team_id)
        where m.match_date >= make_date(extract(year from now() - interval '6 months')::int, 7, 1)
          and not exists (select 1 from public.club_grounds g where g.team_id = t.team_id)) x
  union all
  select 'club_grounds_postcode_checked', case when n = 0 then 'ok' else 'warning' end, n,
    'Club grounds whose postcode has not been looked up (run the club-grounds-verify workflow)'
  from (select count(*) n from public.club_grounds where postcode_checked_at is null) x
  union all
  select 'club_grounds_near_postcode', case when n = 0 then 'ok' else 'failed' end, n,
    'Club grounds more than 1.5 km from their own postcode, or whose postcode does not exist (reviewed exceptions excluded)'
  from (select count(*) n from public.club_grounds
        where postcode_checked_at is not null and postcode_far_reason is null
          and (postcode_distance_m is null or postcode_distance_m > 1500)) x
$function$
;
