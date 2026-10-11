-- ============================================================================
-- GOOGLE SEARCH CONSOLE performance data (11 Oct 2026)
--
-- scripts/gsc_import.py (workflow gsc-import.yml, daily) reads the Search
-- Analytics API for sc-domain:fixtureshark.com with a read-only service
-- account and writes here over SUPABASE_DB_URL.
--
-- Privacy / exposure:
--   * Own schema `gsc`, NOT in the Data API's exposed schemas, and no usage
--     granted to anon/authenticated: PostgREST cannot reach these tables at
--     all. RLS is enabled with no policies as a second lock.
--   * service_role may read (for a future admin page via RPC); only the
--     owner (postgres, the migration/DB-URL role) writes.
--   * Nothing secret is stored: the credential lives only in the GitHub
--     Actions secret GSC_SERVICE_ACCOUNT_JSON.
--
-- Idempotency: each run deletes and rewrites every row in its date window,
-- per table, inside one transaction -- so Google's revisions (including rows
-- that disappear) replace what was there, and a failed run changes nothing.
--
-- Run log: gsc.import_runs (private detail) plus one public.pipeline_runs row
-- per run (job_name 'gsc_import', counts only -- pipeline_runs is publicly
-- readable, so it never carries queries, pages or clicks).
-- public.check_gsc_integrity() is an area in scripts/run_integrity_checks.py.
--
-- Safe to re-run: if not exists / create or replace throughout.
-- ============================================================================

create schema if not exists gsc;
revoke all on schema gsc from public, anon, authenticated;
grant usage on schema gsc to service_role;

create table if not exists gsc.import_runs (
  run_id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null check (mode in ('daily', 'backfill', 'range')),
  site_url text not null,
  search_type text not null,
  start_date date,
  end_date date,
  -- From the API's response metadata: dates on/after this are still being
  -- revised by Google (is_final = false below).
  first_incomplete_date date,
  status text not null default 'running' check (status in ('running', 'success', 'warning', 'failed')),
  rows_written jsonb not null default '{}'::jsonb,
  api_requests integer not null default 0,
  error_message text
);

-- Daily totals for the property (aggregationType byProperty). Calendar is
-- complete between the first and latest day with data: days Google returns
-- nothing for are stored as zero rows, so a gap means "not loaded", never
-- "no traffic".
create table if not exists gsc.daily_totals (
  site_url text not null,
  search_type text not null,
  date date not null,
  clicks bigint not null,
  impressions bigint not null,
  ctr double precision not null,
  position double precision not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references gsc.import_runs (run_id) on delete set null,
  primary key (site_url, search_type, date)
);

create table if not exists gsc.daily_by_device (
  site_url text not null,
  search_type text not null,
  date date not null,
  device text not null,           -- DESKTOP / MOBILE / TABLET
  clicks bigint not null,
  impressions bigint not null,
  ctr double precision not null,
  position double precision not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references gsc.import_runs (run_id) on delete set null,
  primary key (site_url, search_type, date, device)
);

create table if not exists gsc.daily_by_country (
  site_url text not null,
  search_type text not null,
  date date not null,
  country text not null,          -- ISO 3166-1 alpha-3, lower case (gbr)
  clicks bigint not null,
  impressions bigint not null,
  ctr double precision not null,
  position double precision not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references gsc.import_runs (run_id) on delete set null,
  primary key (site_url, search_type, date, country)
);

-- Page / query tables key on an md5 of the text: a URL can exceed the
-- btree row limit (~2.7 kB), and a duplicate from Google should fail the
-- run loudly rather than be merged silently.
create table if not exists gsc.daily_by_page (
  site_url text not null,
  search_type text not null,
  date date not null,
  page text not null,
  page_key text generated always as (md5(page)) stored,
  clicks bigint not null,
  impressions bigint not null,
  ctr double precision not null,
  position double precision not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references gsc.import_runs (run_id) on delete set null,
  primary key (site_url, search_type, date, page_key)
);

-- Queries Google anonymises are omitted by the API, so query-level sums
-- are below the daily totals by design.
create table if not exists gsc.daily_by_query (
  site_url text not null,
  search_type text not null,
  date date not null,
  query text not null,
  query_key text generated always as (md5(query)) stored,
  clicks bigint not null,
  impressions bigint not null,
  ctr double precision not null,
  position double precision not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references gsc.import_runs (run_id) on delete set null,
  primary key (site_url, search_type, date, query_key)
);

create table if not exists gsc.daily_by_page_query (
  site_url text not null,
  search_type text not null,
  date date not null,
  page text not null,
  query text not null,
  pair_key text generated always as (md5(page || chr(31) || query)) stored,
  clicks bigint not null,
  impressions bigint not null,
  ctr double precision not null,
  position double precision not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references gsc.import_runs (run_id) on delete set null,
  primary key (site_url, search_type, date, pair_key)
);

create index if not exists gsc_daily_by_page_page_idx on gsc.daily_by_page (page, date);
create index if not exists gsc_daily_by_query_query_idx on gsc.daily_by_query (query, date);
create index if not exists gsc_daily_by_page_query_page_idx on gsc.daily_by_page_query (page, date);
create index if not exists gsc_import_runs_started_idx on gsc.import_runs (started_at desc);

do $$
declare t text;
begin
  foreach t in array array['import_runs', 'daily_totals', 'daily_by_device', 'daily_by_country',
                           'daily_by_page', 'daily_by_query', 'daily_by_page_query'] loop
    execute format('alter table gsc.%I enable row level security', t);
    execute format('revoke all on gsc.%I from public, anon, authenticated', t);
    execute format('grant select on gsc.%I to service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Integrity area 'gsc' (scripts/run_integrity_checks.py, daily 09:45 UTC).
-- Never-run is a warning, not a failure: the job cannot run until the
-- credential secret is added.
-- ---------------------------------------------------------------------------
create or replace function public.check_gsc_integrity()
returns table (check_name text, status text, found bigint, detail text)
language sql
stable
security definer
set search_path = ''
as $function$
  select 'gsc_import_fresh',
    case when age_days is null then 'warning' when age_days >= 4 then 'failed' when age_days >= 2 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful Search Console import (daily; warns at 2, fails at 4; -1 = never run)'
  from (select (current_date - max(finished_at)::date) age_days
        from gsc.import_runs where status in ('success', 'warning')) x
  union all
  select 'gsc_data_fresh',
    case when lag_days is null then 'warning' when lag_days >= 8 then 'failed' when lag_days >= 5 then 'warning' else 'ok' end,
    coalesce(lag_days, -1)::bigint,
    'Days between today and the latest Search Console date with data (Google lags 1-3 days; warns at 5, fails at 8; -1 = no data)'
  from (select (current_date - max(date)) lag_days
        from gsc.daily_totals where impressions > 0) x
  union all
  -- Independent reconciliation: device and country rows are aggregated by
  -- property like the totals, so each day's breakdown must add up to it.
  select 'gsc_breakdowns_reconcile', case when n = 0 then 'ok' else 'warning' end, n,
    'Days in the last 60 where clicks or impressions by device or by country differ from the daily total by more than 1% (and 2)'
  from (select count(*) n from gsc.daily_totals t
        left join lateral (select coalesce(sum(clicks), 0) c, coalesce(sum(impressions), 0) i
                           from gsc.daily_by_device d
                           where d.site_url = t.site_url and d.search_type = t.search_type and d.date = t.date) dv on true
        left join lateral (select coalesce(sum(clicks), 0) c, coalesce(sum(impressions), 0) i
                           from gsc.daily_by_country c
                           where c.site_url = t.site_url and c.search_type = t.search_type and c.date = t.date) ct on true
        where t.date >= current_date - 60
          and (   (abs(dv.c - t.clicks) > greatest(2, 0.01 * t.clicks))
               or (abs(dv.i - t.impressions) > greatest(2, 0.01 * t.impressions))
               or (abs(ct.c - t.clicks) > greatest(2, 0.01 * t.clicks))
               or (abs(ct.i - t.impressions) > greatest(2, 0.01 * t.impressions)))) x
  union all
  select 'gsc_calendar_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Missing days in gsc.daily_totals between its first and last date (each run stores zero days, so a gap is a load fault)'
  from (select count(*) n
        from (select site_url, search_type, min(date) lo, max(date) hi
              from gsc.daily_totals group by 1, 2) b
        cross join lateral generate_series(b.lo, b.hi, interval '1 day') g(d)
        where not exists (select 1 from gsc.daily_totals t
                          where t.site_url = b.site_url and t.search_type = b.search_type and t.date = g.d::date)) x
  union all
  select 'gsc_runs_failed_7d', case when n = 0 then 'ok' else 'warning' end, n,
    'Failed Search Console import runs in the last 7 days (gsc.import_runs.error_message has the reason)'
  from (select count(*) n from gsc.import_runs
        where status = 'failed' and started_at >= now() - interval '7 days') x
$function$;

revoke all on function public.check_gsc_integrity() from public, anon, authenticated;
grant execute on function public.check_gsc_integrity() to service_role;

-- Data catalogue: the gsc schema is outside meta_refresh_flow's scan (public
-- only); the integrity function is in it, so document it here.
do $$
begin
  if to_regprocedure('public.meta_refresh_flow()') is not null then
    perform public.meta_refresh_flow();
    update public.meta_flow_nodes set layer = 'operations', status = 'current', is_public = false, ai_relevant = false,
      purpose = 'Integrity area gsc: Search Console import freshness, data lag, device/country totals reconciling with daily totals, complete calendar, recent failed runs. Reads the private gsc schema (Search Console performance data, never exposed to the Data API).',
      refresh_note = 'Called by scripts/run_integrity_checks.py (integrity-checks.yml, 09:45 UTC); data loaded by scripts/gsc_import.py (gsc-import.yml, 07:17 UTC).',
      purpose_reviewed_at = now()
    where node_key = 'function:check_gsc_integrity()';
  end if;
end $$;
