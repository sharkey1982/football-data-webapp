-- ============================================================================
-- Whole-site job monitoring (16 Oct 2026).
--
-- Before: each job logged (or not) to its own table; a scheduler saying
-- "succeeded" was read as "data refreshed" (pg_cron's tennis-refresh job
-- succeeded 12 times a day for 11 days while no tennis result arrived);
-- stuck rows were caught only by one 6-hour rule; and the consolidated
-- integrity run had not succeeded since 28 Sep, so nobody saw any of it.
--
-- Now:
-- * public.job_registry: every production data job, where it runs, how
--   often, the longest a run should take, and which log proves it ran.
-- * public.job_runs_unified: one shape over the run logs (pipeline_runs,
--   pg_cron, fixture_refresh_runs, broadcast_sync_runs, fpl_ingestion_runs,
--   result_ingestion_runs, match_import_runs, fpl_live_runs,
--   finance_ingestion_runs), last 30 days.
-- * public.job_health: per job, last attempt and last success, duration,
--   rows changed where the log records it, failures in 7 days, and one
--   health_status:
--     running / stuck (running past max_duration) / failed / timed_out /
--     warning / stale (no success within expected_interval + max_duration
--     + 1h) / success_changed / success_no_change / success (job does not
--     record rows changed) / never_run / not_scheduled
--   An earlier stuck or failed run stays visible (failures_7d, stuck_runs)
--   even after later successes.
-- * public.job_registry_gaps: pg_cron jobs and pipeline_runs job names not
--   in the registry, and registered jobs with no run in 30 days. New jobs are
--   therefore found automatically; GitHub workflows are compared with the
--   registry by scripts/run_integrity_checks.py (it lists them via the API).
-- * public.check_job_health(): one row per kind of problem (not per job), so
--   a bad day raises a handful of lines, not dozens; it runs with the daily
--   integrity checks (area "jobs").
-- * pipeline_runs gains optional row counters (rows_read, rows_inserted,
--   rows_changed, rows_unchanged) so jobs can report success_changed vs
--   success_no_change; nothing has to fill them.
-- * Two simulate_fixture_bonus rows from 6 Oct (run_id 912, 948) were left
--   "running". 948's GitHub job (run 37429888742, step "Simulate fixture
--   bonus") ended failed at 07:48:20 UTC while the database was restarting
--   under load, so the failure could not be written; 912 (07:37:18) matches
--   no workflow run (a hand run) and no backend has held it since. Both are
--   recorded as failed, with that explanation. Later runs succeeded.
-- * no_stuck_runs uses each job's max_duration instead of one 6-hour rule.
-- * cron.job_run_details had no retention (two jobs run every minute);
--   rows older than 60 days are purged weekly.
-- ============================================================================

alter table public.pipeline_runs
  add column if not exists rows_read bigint,
  add column if not exists rows_inserted bigint,
  add column if not exists rows_changed bigint,
  add column if not exists rows_unchanged bigint;
comment on column public.pipeline_runs.rows_changed is
  'Rows inserted or changed by the run, when the job reports it (null = not reported). 0 = the run worked but found nothing new (success_no_change in job_health).';

update public.pipeline_runs
   set status = 'failed',
       error_message = 'Abandoned: the process ended without recording an outcome. '
         || case run_id
              when 948 then 'GitHub run 37429888742 (FPL Projections Pipeline), step "Simulate fixture bonus", ended failed at 2026-10-06 07:48:20 UTC while the database was restarting under load.'
              else 'No GitHub workflow run matches 2026-10-06 07:37 UTC (a hand run); nothing has held it since.'
            end
         || ' Reconciled 2026-10-16; later runs succeeded.'
 where job_name = 'simulate_fixture_bonus' and status = 'running' and run_id in (912, 948);

create table if not exists public.job_registry (
  job_key text primary key,
  area text not null,
  location text not null check (location in ('supabase_cron', 'github_actions', 'edge_function', 'netlify', 'local_pc')),
  schedule text,
  expected_interval interval,          -- null = event-driven: never stale on its own
  max_duration interval not null default interval '1 hour',
  run_log text not null check (run_log in ('pipeline_runs', 'pg_cron', 'fixture_refresh_runs', 'broadcast_sync_runs',
    'fpl_ingestion_runs', 'result_ingestion_runs', 'match_import_runs', 'fpl_live_runs', 'finance_ingestion_runs', 'none')),
  run_key text,                        -- regex on the log's job/source name
  upstream text,
  output_check text,                   -- integrity check that covers the data itself
  active boolean not null default true,
  notes text
);
alter table public.job_registry enable row level security;
revoke all on public.job_registry from anon, authenticated;
grant select on public.job_registry to service_role;
comment on table public.job_registry is
  'Every production data job: where it runs, expected frequency, longest acceptable run, and which log proves it ran. job_health reads it; job_registry_gaps lists jobs missing from it.';

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, output_check, notes) values
  -- Supabase pg_cron
  ('ai-lab-process-queue', 'ai_lab', 'supabase_cron', '* * * * *', '10 minutes', '5 minutes', 'pg_cron', '^ai-lab-process-queue$', 'Claude API', null, 'Processes queued AI Lab questions'),
  ('apply-uk-3pm-blackout-daily', 'broadcasts', 'supabase_cron', '25 4 * * *', '1 day', '10 minutes', 'pg_cron', '^apply-uk-3pm-blackout-daily$', null, null, null),
  ('capture-upcoming-odds', 'odds', 'supabase_cron', '10 7,13,19 * * *', '8 hours', '10 minutes', 'pipeline_runs', '^capture-upcoming-odds$', 'football-data.co.uk fixtures.csv', 'upcoming_odds_fresh', null),
  ('fpl-live-current-6-hourly', 'fpl', 'supabase_cron', '23 */6 * * *', '6 hours', '15 minutes', 'pg_cron', '^fpl-live-current-6-hourly$', 'FPL API', null, null),
  ('fpl-live-tick', 'fpl', 'supabase_cron', '* * * * *', null, '5 minutes', 'fpl_live_runs', '.*', 'FPL API live', 'fpl_live_feed_fresh', 'Only fetches while a match is in play'),
  ('fpl-refresh-6-hourly', 'fpl', 'supabase_cron', '17 */6 * * *', '6 hours', '30 minutes', 'fpl_ingestion_runs', '.*', 'FPL API bootstrap', null, 'private.refresh_fpl(); failed runs roll back their own log row, so pg_cron is the failure record'),
  ('ingest-cup-data-daily', 'football', 'supabase_cron', '15 5 * * *', '1 day', '15 minutes', 'result_ingestion_runs', '^FootballWebPages \(cups\)$', 'Football Web Pages', 'cup_ingestion_current', 'Calls edge function ingest-cup-data'),
  ('meta-refresh-flow-daily', 'catalogue', 'supabase_cron', '45 5 * * *', '1 day', '15 minutes', 'pg_cron', '^meta-refresh-flow-daily$', null, 'catalogue_current', null),
  ('refresh-football-fixtures-daily', 'football', 'supabase_cron', '15 4 * * *', '1 day', '30 minutes', 'fixture_refresh_runs', '.*', 'FixtureDownload feeds', 'stale_scheduled_fixtures', 'Also reconciles kicked-off-but-unplayed fixtures and refreshes predictions'),
  ('refresh-history-derived', 'football', 'supabase_cron', '50 6,12 * * *', '12 hours', '30 minutes', 'pg_cron', '^refresh-history-derived$', null, 'history_snapshot_reconciles', null),
  ('refresh-model-scorecard', 'football', 'supabase_cron', '0 10,22 * * *', '12 hours', '30 minutes', 'pg_cron', '^refresh-model-scorecard$', null, null, null),
  ('refresh-national-league-fixtures-daily', 'football', 'supabase_cron', '35 4 * * *', '1 day', '15 minutes', 'pg_cron', '^refresh-national-league-fixtures-daily$', 'National League fixtures feed', null, null),
  ('snapshot-fpl-projections', 'fpl', 'supabase_cron', '*/10 * * * *', '1 hour', '10 minutes', 'pg_cron', '^snapshot-fpl-projections$', null, null, null),
  ('social-detect-candidates', 'social', 'supabase_cron', '25 1,7,13,19 * * *', '7 hours', '15 minutes', 'pipeline_runs', '^social_detect$', null, null, null),
  ('sync-airtable-broadcasts-3-hourly', 'broadcasts', 'supabase_cron', '40 */3 * * *', '4 hours', '15 minutes', 'broadcast_sync_runs', '.*', 'Airtable (UK Watch Guide)', null, 'Unmatched records: broadcast_unmatched_classified'),
  ('sync-fixture-status-from-results', 'football', 'supabase_cron', '30 9,21 * * *', '12 hours', '10 minutes', 'pg_cron', '^sync-fixture-status-from-results$', null, 'played_without_result', null),
  ('tennis-refresh-2-hourly', 'tennis', 'supabase_cron', '37 */2 * * *', '3 hours', '30 minutes', 'pg_cron', '^tennis-refresh-2-hourly$', null, null, 'Scheduler only: rebuilds derived tennis data when new matches exist. Does NOT fetch results.'),
  ('tennis_refresh', 'tennis', 'supabase_cron', 'after each import', null, '30 minutes', 'pipeline_runs', '^tennis_refresh$', null, 'tennis_matches_mapped', 'Event-driven rebuild of events, editions, summaries, ratings'),
  ('purge-cron-run-details', 'infrastructure', 'supabase_cron', '0 3 * * 0', '8 days', '15 minutes', 'pg_cron', '^purge-cron-run-details$', null, null, 'cron.job_run_details retention (60 days)'),
  -- GitHub Actions
  ('daily-import', 'football', 'github_actions', '0 6 * * *', '1 day 6 hours', '1 hour', 'match_import_runs', '^(E0|E1|E2|E3|EC)$', 'football-data.co.uk (updates Tuesdays)', 'played_without_result', 'English leagues; GitHub may start scheduled runs hours late'),
  ('daily-import-international', 'football', 'github_actions', '20 6 * * *', '1 day 6 hours', '1 hour', 'match_import_runs', '^(?!(E0|E1|E2|E3|EC)$)', 'football-data.co.uk', null, 'Non-English leagues'),
  ('fpl-projections-pipeline', 'fpl', 'github_actions', '41 6,18 * * *', '18 hours', '1 hour', 'pipeline_runs', '^refresh_fpl_projections$', 'FPL API, odds', 'fpl_projection_readiness', null),
  ('simulate_fixture_bonus', 'simulations', 'github_actions', 'in fpl-projections-pipeline', '18 hours', '30 minutes', 'pipeline_runs', '^simulate_fixture_bonus$', null, null, null),
  ('simulate_final_table', 'simulations', 'github_actions', 'in fpl-projections-pipeline', '18 hours', '30 minutes', 'pipeline_runs', '^simulate_final_table$', null, null, null),
  ('refresh_market_goals', 'odds', 'github_actions', 'in fpl-projections-pipeline', '18 hours', '15 minutes', 'pipeline_runs', '^refresh_market_goals$', 'odds', 'fpl_market_goals_fresh', null),
  ('refresh_exit_bands', 'fpl', 'github_actions', 'in fpl-projections-pipeline', '18 hours', '15 minutes', 'pipeline_runs', '^refresh_exit_bands$', null, 'fpl_exit_bands_fresh', null),
  ('ffs-team-news', 'fpl', 'github_actions', '20 7,17 * * *', '18 hours', '15 minutes', 'pipeline_runs', '^ffs_team_news$', 'Fantasy Football Scout', null, null),
  ('ga-import', 'analytics', 'github_actions', '27 7 * * *', '1 day 6 hours', '30 minutes', 'pipeline_runs', '^ga_import$', 'Google Analytics', null, null),
  ('gsc-import', 'analytics', 'github_actions', '17 7 * * *', '1 day 6 hours', '30 minutes', 'pipeline_runs', '^gsc_import$', 'Google Search Console', null, null),
  ('intl-import', 'international', 'github_actions', '30 6 * * *', '1 day 6 hours', '30 minutes', 'pipeline_runs', '^intl_import$', 'international results', null, null),
  ('intlw-import', 'international', 'github_actions', 'in intl-import', '1 day 6 hours', '30 minutes', 'pipeline_runs', '^intlw_import$', 'international results (women)', null, null),
  ('intl-squads', 'international', 'github_actions', '20 7 * * *', '1 day 6 hours', '30 minutes', 'pipeline_runs', '^intl_squads$', 'Wikipedia', null, null),
  ('intlw-squads', 'international', 'github_actions', 'in intl-squads', '1 day 6 hours', '30 minutes', 'pipeline_runs', '^intlw_squads$', 'Wikipedia', null, null),
  ('nfl-import', 'nfl', 'github_actions', '20 6 * * *', '1 day 6 hours', '30 minutes', 'pipeline_runs', '^nfl_import$', 'nflverse', 'nfl_results_fresh', null),
  ('nfl_elo', 'nfl', 'github_actions', 'in nfl-import', '1 day 6 hours', '15 minutes', 'pipeline_runs', '^nfl_elo$', null, 'nfl_model_fresh', null),
  ('nfl_projections', 'nfl', 'github_actions', 'in nfl-import', '1 day 6 hours', '15 minutes', 'pipeline_runs', '^nfl_projections$', 'nflverse injuries', 'nfl_injury_feed', null),
  ('integrity-checks', 'monitoring', 'github_actions', '45 9 * * *', '1 day 6 hours', '30 minutes', 'pipeline_runs', '^model_integrity_checks$', null, null, 'Fails when any check fails'),
  ('netlify-usage', 'infrastructure', 'github_actions', '30 5 * * *', '1 day 6 hours', '15 minutes', 'pipeline_runs', '^netlify_usage_estimate$', 'Netlify API', null, null),
  ('club-grounds-verify', 'club_grounds', 'github_actions', '17 5 1 * *', '32 days', '1 hour', 'pipeline_runs', '^verify_club_grounds$', 'postcodes.io', 'club_grounds', null),
  ('tennis-people', 'tennis', 'github_actions', '41 4 3 * *', '32 days', '30 minutes', 'pipeline_runs', '^tennis_people$', 'Wikidata', null, null),
  ('hindsight-optimal', 'fpl', 'github_actions', '45 6 * * *', null, '30 minutes', 'none', null, null, null, 'No run log yet: monitored only through GitHub (run_integrity_checks.py)'),
  ('site-health', 'monitoring', 'github_actions', '30 8 * * *', null, '15 minutes', 'none', null, 'fixtureshark.com', null, 'No run log: monitored only through GitHub'),
  ('sf-round', 'games', 'github_actions', '5 11,12 * * 0', null, '30 minutes', 'none', null, null, null, 'Shark Fantasy rounds log to sf.sim_runs per step'),
  ('apply-migrations', 'infrastructure', 'github_actions', '50 5 * * *', null, '15 minutes', 'none', null, null, null, 'Results in public.repo_migrations'),
  ('export-db-definitions', 'infrastructure', 'github_actions', '35 5 * * 1', null, '15 minutes', 'none', null, null, null, null),
  ('schema-snapshot', 'infrastructure', 'github_actions', '30 3 * * 1', null, '15 minutes', 'none', null, null, null, null),
  -- Chris's PC
  ('tennis_import', 'tennis', 'local_pc', 'daily, Windows Task Scheduler "FixtureShark tennis import"', '1 day', '30 minutes', 'pipeline_runs', '^tennis_import$', 'tennis-data.co.uk (refuses cloud downloads)', 'tennis_source_coverage_atp', 'Cannot run in the cloud: Cloudflare returns 403 to GitHub Actions and Supabase Edge (tested 16 Oct 2026)'),
  -- On demand (registered so their run logs are not reported as unknown)
  ('history_backfill', 'football', 'github_actions', 'on demand', null, '2 hours', 'pipeline_runs', '^history_backfill$', 'football-data.co.uk', null, null),
  ('finance-ingestion', 'finance', 'local_pc', 'on demand', null, '2 hours', 'finance_ingestion_runs', '.*', 'Companies House, club accounts', null, 'Ad hoc loads'),
  ('integrity-areas', 'monitoring', 'github_actions', 'in integrity-checks', null, '30 minutes', 'pipeline_runs', '^integrity_', null, null, 'One row per integrity area')
on conflict (job_key) do nothing;

-- Unified run log, last 30 days.
create or replace view public.job_runs_unified as
  select 'pipeline_runs'::text as run_log, job_name as run_key, run_id::text as run_id, started_at, finished_at, status,
         rows_changed, error_message as error
    from public.pipeline_runs where started_at > now() - interval '30 days'
  union all
  select 'pg_cron', j.jobname, d.runid::text, d.start_time, d.end_time,
         case d.status when 'succeeded' then 'success' when 'failed' then 'failed' when 'running' then 'running' else d.status end,
         null::bigint, case when d.status = 'failed' then d.return_message end
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where d.start_time > now() - interval '30 days'
  union all
  select 'fixture_refresh_runs', 'fixture_refresh', refresh_run_id::text, started_at, finished_at, status, null::bigint, error_message
    from public.fixture_refresh_runs where started_at > now() - interval '30 days'
  union all
  select 'broadcast_sync_runs', 'airtable_broadcasts', run_id::text, ran_at, ran_at, 'success',
         (coalesce(inserted, 0) + coalesce(updated, 0))::bigint, null
    from public.broadcast_sync_runs where ran_at > now() - interval '30 days'
  union all
  select 'fpl_ingestion_runs', 'refresh_fpl', run_id::text, started_at, completed_at, status, null::bigint, error_message
    from public.fpl_ingestion_runs where started_at > now() - interval '30 days'
  union all
  select 'result_ingestion_runs', source_name, ingestion_run_id::text, started_at, finished_at, status,
         case when matches_inserted is null and matches_changed is null then null
              else coalesce(matches_inserted, 0) + coalesce(matches_changed, 0) end::bigint, error_message
    from public.result_ingestion_runs where started_at > now() - interval '30 days'
  union all
  select 'match_import_runs', league_code, import_run_id::text, started_at, finished_at, status, null::bigint, error_message
    from public.match_import_runs where started_at > now() - interval '30 days'
  union all
  select 'fpl_live_runs', 'fpl_live', run_id::text, run_at, run_at, status, elements_changed::bigint, error
    from public.fpl_live_runs where run_at > now() - interval '30 days'
  union all
  select 'finance_ingestion_runs', source, ingestion_run_id::text, started_at, completed_at, status, facts_extracted::bigint, null
    from public.finance_ingestion_runs where started_at > now() - interval '30 days';
revoke all on public.job_runs_unified from anon, authenticated;
grant select on public.job_runs_unified to service_role;

create or replace view public.job_health as
with runs as (
  select r.job_key, u.*, row_number() over (partition by r.job_key order by u.started_at desc) as rn
  from public.job_registry r
  join public.job_runs_unified u on u.run_log = r.run_log and u.run_key ~ r.run_key
  where r.active and r.run_log <> 'none'
), agg as (
  select job_key,
         max(started_at) as last_attempt,
         max(coalesce(finished_at, started_at)) filter (where status in ('success', 'warning')) as last_success,
         count(*) filter (where status = 'failed' and started_at > now() - interval '7 days') as failures_7d,
         count(*) filter (where started_at > now() - interval '7 days') as runs_7d
  from runs group by job_key
), last_run as (
  select * from runs where rn = 1
), stuck as (
  select r.job_key, count(*) as stuck_runs
  from runs ru join public.job_registry r on r.job_key = ru.job_key
  where ru.status = 'running' and ru.started_at < now() - r.max_duration
  group by r.job_key
)
select r.job_key, r.area, r.location, r.schedule, r.expected_interval, r.max_duration, r.run_log, r.upstream, r.output_check,
       a.last_attempt, a.last_success, l.status as last_status, l.finished_at - l.started_at as last_duration,
       l.rows_changed as last_rows_changed, left(l.error, 500) as last_error,
       coalesce(a.failures_7d, 0) as failures_7d, coalesce(a.runs_7d, 0) as runs_7d, coalesce(s.stuck_runs, 0) as stuck_runs,
       case
         when r.run_log = 'none' then 'not_logged'
         when a.last_attempt is null then case when r.expected_interval is null then 'not_scheduled' else 'never_run' end
         when coalesce(s.stuck_runs, 0) > 0 then 'stuck'
         when l.status = 'running' then 'running'
         when r.expected_interval is not null
              and coalesce(a.last_success, '-infinity'::timestamptz) < now() - r.expected_interval - r.max_duration - interval '1 hour' then 'stale'
         when l.status = 'failed' and l.error ~* '(statement timeout|57014|timed out|timeout)' then 'timed_out'
         when l.status = 'failed' then 'failed'
         when l.status = 'warning' then 'warning'
         when l.rows_changed > 0 then 'success_changed'
         when l.rows_changed = 0 then 'success_no_change'
         else 'success'
       end as health_status,
       r.notes
from public.job_registry r
left join agg a on a.job_key = r.job_key
left join last_run l on l.job_key = r.job_key
left join stuck s on s.job_key = r.job_key
where r.active;
revoke all on public.job_health from anon, authenticated;
grant select on public.job_health to service_role;
comment on view public.job_health is
  'Per production job: last attempt, last success, duration, rows changed, failures and stuck runs in 7 days, and health_status. A scheduler success is not a data refresh: jobs that write their own log are judged by it.';

create or replace view public.job_registry_gaps as
  select 'pg_cron job not registered'::text as gap, j.jobname as name
    from cron.job j
   where j.active and not exists (select 1 from public.job_registry r where r.job_key = j.jobname)
  union all
  select 'pipeline_runs job not registered', p.job_name
    from (select distinct job_name from public.pipeline_runs where started_at > now() - interval '30 days') p
   where not exists (select 1 from public.job_registry r where r.run_log = 'pipeline_runs' and p.job_name ~ r.run_key)
  union all
  select 'registered job with no run in 30 days', h.job_key
    from public.job_health h where h.health_status = 'never_run';
revoke all on public.job_registry_gaps from anon, authenticated;
grant select on public.job_registry_gaps to service_role;

create or replace function public.check_job_health()
returns table(check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  select 'jobs_failed', case when count(*) = 0 then 'ok' else 'failed' end, count(*),
    'Jobs whose latest run failed or timed out: ' || coalesce(string_agg(job_key || ' (' || health_status || coalesce(': ' || left(last_error, 80), '') || ')', '; ' order by job_key), 'none')
  from public.job_health where health_status in ('failed', 'timed_out')
  union all
  select 'jobs_stale', case when count(*) = 0 then 'ok' else 'failed' end, count(*),
    'Jobs with no successful run within their expected interval: ' || coalesce(string_agg(job_key || ' (last success ' || coalesce(to_char(last_success, 'YYYY-MM-DD HH24:MI'), 'never') || ')', '; ' order by job_key), 'none')
  from public.job_health where health_status = 'stale'
  union all
  select 'jobs_stuck', case when count(*) = 0 then 'ok' else 'failed' end, coalesce(sum(stuck_runs), 0)::bigint,
    'Runs still "running" past their job''s max_duration: ' || coalesce(string_agg(job_key || ' x' || stuck_runs, '; ' order by job_key), 'none')
  from public.job_health where stuck_runs > 0
  union all
  select 'jobs_recent_failures', case when count(*) = 0 then 'ok' else 'warning' end, coalesce(sum(failures_7d), 0)::bigint,
    'Jobs now healthy but with failed runs in the last 7 days (a later success does not erase them): ' || coalesce(string_agg(job_key || ' x' || failures_7d, '; ' order by job_key), 'none')
  from public.job_health where failures_7d > 0 and health_status not in ('failed', 'timed_out', 'stale', 'stuck')
  union all
  select 'jobs_registry_gaps', case when count(*) = 0 then 'ok' else 'warning' end, count(*),
    'Jobs missing from public.job_registry or never run: ' || coalesce(string_agg(gap || ': ' || name, '; ' order by gap, name), 'none')
  from public.job_registry_gaps
$$;
revoke all on function public.check_job_health() from public, anon, authenticated;
grant execute on function public.check_job_health() to service_role;

-- no_stuck_runs: per-job threshold.
do $$
declare d text; a text := 'select ''pipeline_runs:'' || job_name j from public.pipeline_runs where status = ''running'' and started_at < now() - interval ''6 hours''';
begin
  d := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'no_stuck_runs anchor not found exactly once'; end if;
  d := replace(d, a, 'select ''pipeline_runs:'' || p.job_name j from public.pipeline_runs p where p.status = ''running'' and p.started_at < now() - coalesce((select min(r.max_duration) from public.job_registry r where r.run_log = ''pipeline_runs'' and p.job_name ~ r.run_key), interval ''6 hours'')');
  d := replace(d, 'Runs still marked running after 6h (died without recording an outcome)', 'Runs still marked running past their job''s max_duration (job_registry; 6h if unregistered)');
  execute d;
end $$;

-- cron.job_run_details retention.
select cron.unschedule('purge-cron-run-details') where exists (select 1 from cron.job where jobname = 'purge-cron-run-details');
select cron.schedule('purge-cron-run-details', '0 3 * * 0', $$delete from cron.job_run_details where start_time < now() - interval '60 days'$$);

-- Checks.
do $$
declare n bigint;
begin
  if exists (select 1 from public.pipeline_runs where run_id in (912, 948) and status = 'running') then
    raise exception 'abandoned simulate_fixture_bonus runs not reconciled';
  end if;
  select found into n from public.check_model_integrity() where check_name = 'no_stuck_runs';
  if n <> 0 then raise exception 'no_stuck_runs still finds % run(s)', n; end if;
  if (select count(*) from public.job_health) < 40 then raise exception 'job_health lists too few jobs'; end if;
  -- a deliberately stuck run is detected, and a later success does not hide it
  begin
    insert into public.pipeline_runs (job_name, status, started_at) values ('simulate_fixture_bonus', 'running', now() - interval '2 hours');
    insert into public.pipeline_runs (job_name, status, started_at, finished_at) values ('simulate_fixture_bonus', 'success', now() - interval '1 minute', now());
    if (select stuck_runs from public.job_health where job_key = 'simulate_fixture_bonus') <> 1 then
      raise exception 'job_health missed a run stuck past max_duration';
    end if;
    if (select status from public.check_job_health() where check_name = 'jobs_stuck') <> 'failed' then
      raise exception 'check_job_health did not fail on a stuck run';
    end if;
    -- an unregistered job is reported
    insert into public.pipeline_runs (job_name, status, started_at, finished_at) values ('zz_unregistered_job', 'success', now(), now());
    if not exists (select 1 from public.job_registry_gaps where name = 'zz_unregistered_job') then
      raise exception 'job_registry_gaps missed an unregistered job';
    end if;
    raise exception using errcode = 'P0001', message = 'rollback-test';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback-test' then raise; end if;
  end;
end $$;
