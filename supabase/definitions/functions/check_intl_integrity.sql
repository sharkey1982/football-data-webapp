-- Live definition exported from the database (function check_intl_integrity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_intl_integrity()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'intl_fresh',
    case when age_days is null or age_days >= 5 then 'failed' when age_days >= 2 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful intl_import run (daily on GitHub Actions; warns at 2, fails at 5; -1 = never)'
  from (select extract(day from now() - max(finished_at))::int age_days
        from public.pipeline_runs where job_name = 'intl_import' and status = 'success') x
  union all
  select 'intl_major_games_staged', case when n = 0 then 'ok' else 'failed' end, n,
    'World Cup and Euro finals games without an edition and stage'
  from (select count(*) n from intl.matches
        where competition in ('FIFA World Cup', 'UEFA Euro') and (edition_key is null or stage_code is null)) x
  union all
  select 'intl_stage_rows', case when n = 0 then 'ok' else 'failed' end, n,
    'Matches whose edition and stage have no intl.stages row'
  from (select count(*) n from intl.matches m
        where m.edition_key is not null
          and not exists (select 1 from intl.stages s where s.edition_key = m.edition_key and s.code = m.stage_code)) x
  union all
  select 'intl_elo_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Matches without Elo ratings'
  from (select count(*) n from intl.matches where elo_change is null) x
  union all
  -- The results file trails the games by days to weeks; this is a watch, not a fault.
  select 'intl_results_lag', case when n = 0 then 'ok' else 'warning' end, n,
    'Fixtures more than 14 days old with no result in the results file yet'
  from (select count(*) n from public.intl_fixtures
        where kickoff_utc < now() - interval '14 days' and match_key is null) x
  union all
  select 'intl_squads_fresh',
    case when age_days is null or age_days >= 5 then 'failed' when age_days >= 2 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since intl_squads last wrote squads (daily on GitHub Actions; a warning run counts; warns at 2, fails at 5; -1 = never)'
  from (select extract(day from now() - max(finished_at))::int age_days
        from public.pipeline_runs where job_name = 'intl_squads' and status in ('success', 'warning')) x
  union all
  select 'intl_club_elo_fresh',
    case when age_days is null or age_days >= 3 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the stored ClubElo table was fetched (api.clubelo.com; squads keep the last ratings when it is down; -1 = none stored)'
  from (select (current_date - max(fetched_on))::int age_days from intl.club_elo) x
$function$
;
