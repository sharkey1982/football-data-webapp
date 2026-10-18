-- ============================================================================
-- Weekly browser smoke and performance tests (18 Oct 2026).
--
-- scripts/smoke/weekly_smoke.mjs (workflow weekly-smoke.yml) loads every key
-- page type of the live site in a throttled mobile browser each Monday, and
-- each Netlify deploy preview unthrottled. It stores one smoke_runs row and a
-- smoke_page_results row per page: HTTP status, errors (JS errors, failed
-- requests, error text, empty pages and tables, stuck spinners), budget
-- warnings, and the measurements (TTFB, FCP, LCP, CLS, blocking time,
-- requests, transfer, JavaScript, slowest Supabase call).
--
-- Monitoring: job_registry 'weekly-smoke'; check_job_health gains
-- smoke_tests_passed (failed if the latest production run had a failing
-- page, warning if pages were over budget) and smoke_performance_trend
-- (warning if median LCP worsened more than 20% on the previous run).
-- ============================================================================

create table if not exists public.smoke_runs (
  smoke_run_id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  base_url text not null,
  kind text not null check (kind in ('production', 'preview', 'manual')),
  mode text not null check (mode in ('full', 'quick')),
  pages_tested int not null,
  pages_failed int not null,
  pages_warned int not null,
  median_lcp_ms int,
  median_ttfb_ms int,
  median_js_kb int,
  summary text,
  workflow_run_id bigint
);
create table if not exists public.smoke_page_results (
  smoke_run_id bigint not null references public.smoke_runs on delete cascade,
  page_type text not null,
  url text,
  ok boolean not null,
  http_status int,
  errors jsonb not null default '[]',
  warnings jsonb not null default '[]',
  ttfb_ms int, fcp_ms int, lcp_ms int, cls numeric, tbt_ms int, load_ms int,
  requests int, transfer_kb int, js_kb int, api_calls int, slowest_api_ms int, slowest_api_url text,
  primary key (smoke_run_id, page_type)
);
create index if not exists smoke_runs_kind_started_idx on public.smoke_runs (kind, started_at desc);
alter table public.smoke_runs enable row level security;
alter table public.smoke_page_results enable row level security;
revoke all on public.smoke_runs, public.smoke_page_results from anon, authenticated;
grant select, insert on public.smoke_runs, public.smoke_page_results to service_role;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, output_check, outcome_is_check, notes) values
  ('weekly-smoke', 'monitoring', 'github_actions', '12 7 * * 1', '8 days', '45 minutes', 'pipeline_runs', '^weekly_smoke$', 'fixtureshark.com', 'smoke_tests_passed', true,
   'Browser smoke + Core Web Vitals on the live site; deploy previews are tested too (smoke_runs kind preview)')
on conflict (job_key) do nothing;

create or replace view public.smoke_latest as
select r.smoke_run_id, r.started_at, r.kind, r.base_url, p.page_type, p.url, p.ok, p.errors, p.warnings,
       p.ttfb_ms, p.fcp_ms, p.lcp_ms, p.cls, p.tbt_ms, p.js_kb, p.requests, p.slowest_api_ms, p.slowest_api_url
from (select * from public.smoke_runs where kind = 'production' order by started_at desc limit 1) r
join public.smoke_page_results p using (smoke_run_id);
revoke all on public.smoke_latest from anon, authenticated;
grant select on public.smoke_latest to service_role;

do $$
declare d text; a text := '  union all
  select ''jobs_registry_gaps''';
begin
  d := pg_get_functiondef('public.check_job_health()'::regprocedure);
  if position(a in d) = 0 then raise exception 'check_job_health anchor not found'; end if;
  d := replace(d, a, '  union all
  select ''smoke_tests_passed'',
    case when r.smoke_run_id is null then ''warning'' when r.pages_failed > 0 then ''failed'' when r.pages_warned > 0 then ''warning'' else ''ok'' end,
    coalesce(r.pages_failed, 0)::bigint,
    coalesce(''Latest production smoke run '' || to_char(r.started_at, ''YYYY-MM-DD HH24:MI'') || '': '' || r.summary, ''No production smoke run yet (weekly-smoke.yml)'')
  from (select 1) one
  left join lateral (select * from public.smoke_runs where kind = ''production'' order by started_at desc limit 1) r on true
  union all
  select ''smoke_performance_trend'',
    case when cur.median_lcp_ms is null or prev.median_lcp_ms is null then ''ok''
         when cur.median_lcp_ms > prev.median_lcp_ms * 1.2 then ''warning'' else ''ok'' end,
    coalesce(cur.median_lcp_ms, 0)::bigint,
    ''Median LCP of the latest production smoke run vs the one before: '' || coalesce(cur.median_lcp_ms::text, ''-'') || '' ms vs '' || coalesce(prev.median_lcp_ms::text, ''-'') || '' ms (warns above +20%)''
  from (select 1) one
  left join lateral (select median_lcp_ms from public.smoke_runs where kind = ''production'' order by started_at desc limit 1) cur on true
  left join lateral (select median_lcp_ms from public.smoke_runs where kind = ''production'' order by started_at desc offset 1 limit 1) prev on true
' || a);
  execute d;
end $$;

do $$
begin
  if (select count(*) from public.check_job_health() where check_name in ('smoke_tests_passed', 'smoke_performance_trend')) <> 2 then
    raise exception 'smoke checks missing';
  end if;
end $$;
