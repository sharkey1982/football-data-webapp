-- IndexNow job (AI search audit, 1 Nov 2026): .github/workflows/indexnow.yml
-- submits changed sitemap URLs to IndexNow hourly and logs one pipeline_runs
-- row per run. Registered so job_health notices if it stops. Safe to re-run.
insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values ('indexnow', 'monitoring', 'github_actions', '50 * * * *', interval '3 hours', interval '00:10:00',
        'pipeline_runs', '^indexnow$', 'api.indexnow.org',
        'Submits URLs whose sitemap lastmod changed since the last run; summary has counts and HTTP status')
on conflict do nothing;
