-- Live definition exported from the database (function check_tennis_integrity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_tennis_integrity()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'tennis_fresh',
    case when age_days is null then 'warning' when age_days >= 7 then 'failed' when age_days >= 3 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful tennis_import run (scripts/tennis_import.py on Chris''s PC: tennis-data.co.uk refuses cloud downloads; warns at 3, fails at 7; -1 = never run)'
  from (select extract(day from now() - max(finished_at))::int age_days
        from public.pipeline_runs where job_name = 'tennis_import' and status = 'success') x
  union all
  -- Freshness from the data itself: a run that loads nothing new still
  -- "succeeds", and a successful run log says nothing about coverage.
  select 'tennis_source_coverage_' || lower(t.tour),
    case when extract(month from current_date) = 12 then 'ok'
         when d.last_match is null or current_date - d.last_match >= 17 then 'failed'
         when current_date - d.last_match >= 10 then 'warning' else 'ok' end,
    coalesce(current_date - d.last_match, -1)::bigint,
    'Days since the latest stored ' || t.tour || ' match (' || coalesce(d.last_match::text, 'none') ||
      '); in season (Jan-Nov) warns at 10, fails at 17'
  from (values ('ATP'), ('WTA')) t(tour)
  left join lateral (select max(m.match_date) last_match from tennis.matches m where m.tour = t.tour) d on true
  union all
  select 'tennis_sets_consistent', case when n = 0 then 'ok' else 'warning' end, n,
    'Completed tennis matches where sets won do not match the set scores, not yet reviewed (reviewed source errors are listed in tennis.source_anomalies)'
  from (select count(*) n from tennis.matches m
        where m.status = 'Completed' and m.w_sets is not null
          and not exists (select 1 from tennis.source_anomalies a where a.source_key = m.source_key)
          and (m.w_sets <= m.l_sets
               or m.w_sets <> (select count(*) from generate_subscripts(m.w_games, 1) i where m.w_games[i] > m.l_games[i])
               or m.l_sets <> (select count(*) from generate_subscripts(m.l_games, 1) i where m.l_games[i] > m.w_games[i]))) x
  union all
  select 'tennis_source_errors_reviewed', 'ok', (select count(*) from tennis.source_anomalies),
    'Matches whose source row is internally inconsistent, reviewed 16 Oct 2026 and kept as published (tennis.source_anomalies)'
  union all
  select 'tennis_matches_mapped', case when n = 0 then 'ok' else 'failed' end, n,
    'Tennis matches missing from public.tennis_matches (unmapped player or tournament)'
  from (select (select count(*) from tennis.matches) - (select count(*) from public.tennis_matches) n) x
$function$
;
