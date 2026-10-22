-- ============================================================================
-- Audit P-07 (22 Oct 2026): scheduled workflows that wrote no run log now
-- write one pipeline_runs row per run (a "Log run" step in each workflow),
-- and gameweek-report, scheduled since 21 Oct, is registered.
--
-- registered_at is reset so job_health reports awaiting_first_run, not
-- never_run, until each job's first logged run. Safe to re-run.
-- ============================================================================
update public.job_registry r
   set run_log = 'pipeline_runs',
       run_key = '^' || v.job_name || '$',
       expected_interval = v.expected::interval,
       registered_at = now()
  from (values
    ('apply-migrations',      'apply_migrations',      '1 day 06:00:00'),
    ('export-db-definitions', 'export_db_definitions', '8 days'),
    ('hindsight-optimal',     'hindsight_optimal',     '1 day 06:00:00'),
    ('schema-snapshot',       'schema_snapshot',       '8 days'),
    ('sf-round',              'sf_round',              '8 days'),
    ('site-health',           'site_health',           '1 day 06:00:00')
  ) v(job_key, job_name, expected)
 where r.job_key = v.job_key and r.run_log = 'none';

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, active, outcome_is_check, notes)
values ('gameweek-report', 'fpl', 'github_actions', '20 21,22 * * *; 50 22 * * *', '1 day 06:00:00', '00:20:00', 'pipeline_runs', '^gameweek_report$', true, false,
        'Provisional reflection check on gameweek nights (scripts/fpl_gameweek_report.py --auto --only reflection); also dispatched by pg_cron (P-01)')
on conflict (job_key) do nothing;
