-- Live definition exported from the database (function check_broadcast_integrity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_broadcast_integrity()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- No submission yet counts from when the route was registered, so a task
  -- that never starts still goes red.
  select 'broadcast_research_fresh',
    case when age_days >= 9 then 'failed' when age_days >= 5 then 'warning' else 'ok' end,
    age_days::bigint,
    'Days since the last broadcast research submission (broadcast_sync_runs source claude_research; scheduled Claude task, docs/broadcast-research.md; warns at 5, fails at 9; '
      || coalesce('last ' || to_char(last_run, 'YYYY-MM-DD HH24:MI'), 'none yet, counted from set-up') || ')'
  from (select r.last_run,
               extract(day from now() - coalesce(r.last_run,
                 (select j.registered_at from public.job_registry j where j.job_key = 'broadcast-research'), now()))::int age_days
        from (select max(ran_at) last_run from public.broadcast_sync_runs where source = 'claude_research') r) x
  union all
  select 'broadcast_decisions_next_10d', case when n = 0 then 'ok' else 'warning' end, n,
    'Premier League, EFL and Carabao Cup fixtures in the next 10 days with no GB broadcast decision (no listing and not marked not televised)'
      || coalesce(': ' || sample, '')
  from (select count(*) n, string_agg(slug, ', ' order by rn) filter (where rn <= 10) sample
        from (select f.slug, row_number() over (order by f.kickoff_date, f.kickoff_time, f.slug) rn
              from public.fixtures f join public.leagues l on l.league_id = f.league_id
              where l.code in ('E0', 'E1', 'E2', 'E3', 'LC') and f.status = 'scheduled'
                and f.kickoff_date between current_date and current_date + 10
                and not exists (select 1 from public.fixture_broadcasts fb where fb.fixture_id = f.fixture_id and fb.market = 'GB')) y) x
  union all
  select 'broadcast_unmatched_upcoming', case when n = 0 then 'ok' else 'warning' end, n,
    'Submitted broadcast rows for upcoming games that ingest_broadcasts could not place (broadcast_unmatched_classified; fix the row or add a team alias, source_name broadcasts)'
  from (select count(*) n from public.broadcast_sync_unmatched u
        where u.resolved_at is null and u.airtable_record_id like 'research:%' and u.kickoff_date >= current_date
          and u.reason not like '%competition not covered%') x
$function$
;
