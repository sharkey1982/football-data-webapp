-- ============================================================================
-- GOOGLE ANALYTICS 4 traffic data + admin Site traffic page (12 Oct 2026)
--
-- scripts/ga_import.py (workflow ga-import.yml, daily) reads the GA4 Data API
-- for the FixtureShark property with the same read-only service account as
-- Search Console (Viewer on the GA4 property) and writes here over
-- SUPABASE_DB_URL. Same conventions as the gsc schema
-- (20261011220000_gsc_search_console.sql):
--   * own schema `ga`, not exposed to the Data API, no anon/authenticated
--     grants, RLS on with no policies; service_role may read;
--   * each run deletes and rewrites its date window in one transaction;
--   * gsc-style run log ga.import_runs + public.pipeline_runs ('ga_import',
--     counts only), integrity area 'ga' (public.check_ga_integrity()).
--
-- GA only loads after a visitor accepts the cookie banner (and never on an
-- admin's device), so these figures undercount real visitors. Search
-- Console is unaffected.
--
-- public.get_site_traffic(p_days) feeds /admin/traffic: admin-only
-- (_require_admin), executable by authenticated, never anon.
--
-- Safe to re-run.
-- ============================================================================

create schema if not exists ga;
revoke all on schema ga from public, anon, authenticated;
grant usage on schema ga to service_role;

create table if not exists ga.import_runs (
  run_id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null check (mode in ('daily', 'backfill', 'range')),
  property_id text not null,
  start_date date,
  end_date date,
  status text not null default 'running' check (status in ('running', 'success', 'warning', 'failed')),
  rows_written jsonb not null default '{}'::jsonb,
  api_requests integer not null default 0,
  error_message text
);

-- Metrics shared by every breakdown table. Users are NOT additive across
-- days or breakdowns (one person can appear on several days, devices or
-- pages); sessions, page views and engagement seconds are.
create table if not exists ga.daily_totals (
  property_id text not null,
  date date not null,
  active_users bigint not null,
  new_users bigint not null,
  sessions bigint not null,
  engaged_sessions bigint not null,
  page_views bigint not null,
  engagement_seconds bigint not null,
  events bigint not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references ga.import_runs (run_id) on delete set null,
  primary key (property_id, date)
);

create table if not exists ga.daily_by_channel (
  property_id text not null,
  date date not null,
  channel_group text not null,    -- sessionDefaultChannelGroup (Organic Search, Direct, Referral...)
  source text not null,           -- sessionSource (google, reddit.com, (direct)...)
  medium text not null,           -- sessionMedium
  dim_key text generated always as (md5(channel_group || chr(31) || source || chr(31) || medium)) stored,
  active_users bigint not null,
  sessions bigint not null,
  engaged_sessions bigint not null,
  page_views bigint not null,
  engagement_seconds bigint not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references ga.import_runs (run_id) on delete set null,
  primary key (property_id, date, dim_key)
);

create table if not exists ga.daily_by_landing_page (
  property_id text not null,
  date date not null,
  landing_page text not null,     -- landingPage (path, no query string)
  dim_key text generated always as (md5(landing_page)) stored,
  active_users bigint not null,
  sessions bigint not null,
  engaged_sessions bigint not null,
  page_views bigint not null,
  engagement_seconds bigint not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references ga.import_runs (run_id) on delete set null,
  primary key (property_id, date, dim_key)
);

create table if not exists ga.daily_by_page (
  property_id text not null,
  date date not null,
  page_path text not null,        -- pagePath
  dim_key text generated always as (md5(page_path)) stored,
  active_users bigint not null,
  sessions bigint not null,
  engaged_sessions bigint not null,
  page_views bigint not null,
  engagement_seconds bigint not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references ga.import_runs (run_id) on delete set null,
  primary key (property_id, date, dim_key)
);

create table if not exists ga.daily_by_device (
  property_id text not null,
  date date not null,
  device text not null,           -- deviceCategory
  dim_key text generated always as (md5(device)) stored,
  active_users bigint not null,
  sessions bigint not null,
  engaged_sessions bigint not null,
  page_views bigint not null,
  engagement_seconds bigint not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references ga.import_runs (run_id) on delete set null,
  primary key (property_id, date, dim_key)
);

create table if not exists ga.daily_by_country (
  property_id text not null,
  date date not null,
  country text not null,          -- country (name, e.g. United Kingdom)
  dim_key text generated always as (md5(country)) stored,
  active_users bigint not null,
  sessions bigint not null,
  engaged_sessions bigint not null,
  page_views bigint not null,
  engagement_seconds bigint not null,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references ga.import_runs (run_id) on delete set null,
  primary key (property_id, date, dim_key)
);

create index if not exists ga_daily_by_page_path_idx on ga.daily_by_page (page_path, date);
create index if not exists ga_import_runs_started_idx on ga.import_runs (started_at desc);

do $$
declare t text;
begin
  foreach t in array array['import_runs', 'daily_totals', 'daily_by_channel', 'daily_by_landing_page',
                           'daily_by_page', 'daily_by_device', 'daily_by_country'] loop
    execute format('alter table ga.%I enable row level security', t);
    execute format('revoke all on ga.%I from public, anon, authenticated', t);
    execute format('grant select on ga.%I to service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Integrity area 'ga'. Never-run is a warning (needs property access first).
-- ---------------------------------------------------------------------------
create or replace function public.check_ga_integrity()
returns table (check_name text, status text, found bigint, detail text)
language sql
stable
security definer
set search_path = ''
as $function$
  select 'ga_import_fresh',
    case when age_days is null then 'warning' when age_days >= 4 then 'failed' when age_days >= 2 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful Google Analytics import (daily; warns at 2, fails at 4; -1 = never run)'
  from (select (current_date - max(finished_at)::date) age_days
        from ga.import_runs where status in ('success', 'warning')) x
  union all
  select 'ga_data_fresh',
    case when lag_days is null then 'warning' when lag_days >= 7 then 'failed' when lag_days >= 4 then 'warning' else 'ok' end,
    coalesce(lag_days, -1)::bigint,
    'Days between today and the latest Google Analytics date with sessions (warns at 4, fails at 7; -1 = no data). Only consenting visitors are counted, so a quiet spell can warn'
  from (select (current_date - max(date)) lag_days from ga.daily_totals where sessions > 0) x
  union all
  -- Sessions are additive, so device and country breakdowns must add up to
  -- the day's total.
  select 'ga_breakdowns_reconcile', case when n = 0 then 'ok' else 'warning' end, n,
    'Days in the last 60 where sessions by device or by country differ from the daily total by more than 2% (and 2)'
  from (select count(*) n from ga.daily_totals t
        left join lateral (select coalesce(sum(sessions), 0) s from ga.daily_by_device d
                           where d.property_id = t.property_id and d.date = t.date) dv on true
        left join lateral (select coalesce(sum(sessions), 0) s from ga.daily_by_country c
                           where c.property_id = t.property_id and c.date = t.date) ct on true
        where t.date >= current_date - 60
          and (abs(dv.s - t.sessions) > greatest(2, 0.02 * t.sessions)
               or abs(ct.s - t.sessions) > greatest(2, 0.02 * t.sessions))) x
  union all
  select 'ga_calendar_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Missing days in ga.daily_totals between its first and last date (each run stores zero days, so a gap is a load fault)'
  from (select count(*) n
        from (select property_id, min(date) lo, max(date) hi from ga.daily_totals group by 1) b
        cross join lateral generate_series(b.lo, b.hi, interval '1 day') g(d)
        where not exists (select 1 from ga.daily_totals t where t.property_id = b.property_id and t.date = g.d::date)) x
  union all
  select 'ga_runs_failed_7d', case when n = 0 then 'ok' else 'warning' end, n,
    'Failed Google Analytics import runs in the last 7 days (ga.import_runs.error_message has the reason)'
  from (select count(*) n from ga.import_runs where status = 'failed' and started_at >= now() - interval '7 days') x
$function$;

revoke all on function public.check_ga_integrity() from public, anon, authenticated;
grant execute on function public.check_ga_integrity() to service_role;

-- ---------------------------------------------------------------------------
-- /admin/traffic: one call, the last p_days days (ending yesterday) plus the same-length period before it for comparison.
-- ---------------------------------------------------------------------------
create or replace function public.get_site_traffic(p_days integer default 28)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_days integer := least(greatest(coalesce(p_days, 28), 1), 500);
  v_end date;
  v_start date;
  v_prev_start date;
  v_prev_end date;
  v_out jsonb;
begin
  perform public._require_admin();

  -- Up to yesterday (UK): today is always partial in GA. Search Console
  -- lags 2-3 days, so its last days show as zero until they arrive.
  v_end := (now() at time zone 'Europe/London')::date - 1;
  v_start := v_end - (v_days - 1);
  v_prev_end := v_start - 1;
  v_prev_start := v_prev_end - (v_days - 1);

  with
  gsc_t as (select date, sum(clicks) clicks, sum(impressions) impressions,
                   sum(position * impressions) pos_w, bool_and(is_final) fin
            from gsc.daily_totals where date between v_prev_start and v_end group by date),
  ga_t as (select date, sum(active_users) users, sum(new_users) new_users, sum(sessions) sessions,
                  sum(engaged_sessions) engaged, sum(page_views) views, sum(engagement_seconds) eng_s,
                  bool_and(is_final) fin
           from ga.daily_totals where date between v_prev_start and v_end group by date),
  cal as (select g::date date from generate_series(v_prev_start, v_end, interval '1 day') g),
  daily as (
    select c.date, c.date >= v_start cur,
           coalesce(s.clicks, 0) clicks, coalesce(s.impressions, 0) impressions, s.pos_w,
           coalesce(a.users, 0) users, coalesce(a.new_users, 0) new_users, coalesce(a.sessions, 0) sessions,
           coalesce(a.engaged, 0) engaged, coalesce(a.views, 0) views, coalesce(a.eng_s, 0) eng_s,
           (coalesce(s.fin, true) and coalesce(a.fin, true)) fin
    from cal c left join gsc_t s using (date) left join ga_t a using (date)),
  per as (
    select cur, sum(clicks) clicks, sum(impressions) impressions,
           case when sum(impressions) > 0 then sum(pos_w) / sum(impressions) end position,
           sum(sessions) sessions, sum(engaged) engaged, sum(views) views, sum(eng_s) eng_s,
           sum(users) user_days, sum(new_users) new_users
    from daily group by cur)
  select jsonb_build_object(
    'start', v_start, 'end', v_end, 'days', v_days,
    'periods', (select jsonb_object_agg(case when cur then 'current' else 'previous' end, to_jsonb(per) - 'cur') from per),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                'date', date, 'clicks', clicks, 'impressions', impressions, 'users', users,
                'sessions', sessions, 'views', views, 'final', fin) order by date), '[]'::jsonb)
              from daily where cur),
    'sections', (select coalesce(jsonb_agg(x order by x.views desc), '[]'::jsonb) from (
                  select coalesce(nullif(split_part(page_path, '/', 2), ''), '(home)') section,
                         sum(page_views) views, sum(sessions) sessions, sum(engagement_seconds) eng_s
                  from ga.daily_by_page where date between v_start and v_end group by 1) x),
    'pages', (select coalesce(jsonb_agg(x order by x.views desc), '[]'::jsonb) from (
               select page_path page, sum(page_views) views, sum(sessions) sessions,
                      sum(engagement_seconds) eng_s
               from ga.daily_by_page where date between v_start and v_end
               group by 1 order by 2 desc limit 200) x),
    'landing', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]'::jsonb) from (
                 select landing_page page, sum(sessions) sessions, sum(engaged_sessions) engaged,
                        sum(page_views) views
                 from ga.daily_by_landing_page where date between v_start and v_end
                 group by 1 order by 2 desc limit 200) x),
    'sources', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]'::jsonb) from (
                 select channel_group, source, medium, sum(sessions) sessions, sum(engaged_sessions) engaged,
                        sum(page_views) views
                 from ga.daily_by_channel where date between v_start and v_end
                 group by 1, 2, 3 order by 4 desc limit 100) x),
    'devices', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]'::jsonb) from (
                 select device, sum(sessions) sessions, sum(page_views) views
                 from ga.daily_by_device where date between v_start and v_end group by 1) x),
    'countries', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]'::jsonb) from (
                   select country, sum(sessions) sessions, sum(page_views) views
                   from ga.daily_by_country where date between v_start and v_end
                   group by 1 order by 2 desc limit 50) x),
    'search_queries', (select coalesce(jsonb_agg(x order by x.impressions desc), '[]'::jsonb) from (
                        select query, sum(clicks) clicks, sum(impressions) impressions,
                               sum(position * impressions) / nullif(sum(impressions), 0) position
                        from gsc.daily_by_query where date between v_start and v_end
                        group by 1 order by 3 desc limit 200) x),
    'search_pages', (select coalesce(jsonb_agg(x order by x.impressions desc), '[]'::jsonb) from (
                      select page, sum(clicks) clicks, sum(impressions) impressions,
                             sum(position * impressions) / nullif(sum(impressions), 0) position
                      from gsc.daily_by_page where date between v_start and v_end
                      group by 1 order by 3 desc limit 200) x),
    'search_countries', (select coalesce(jsonb_agg(x order by x.impressions desc), '[]'::jsonb) from (
                          select country, sum(clicks) clicks, sum(impressions) impressions
                          from gsc.daily_by_country where date between v_start and v_end
                          group by 1 order by 3 desc limit 50) x),
    'loaded', jsonb_build_object(
      'gsc_last_date', (select max(date) from gsc.daily_totals),
      'gsc_last_run', (select max(finished_at) from gsc.import_runs where status in ('success', 'warning')),
      'ga_last_date', (select max(date) from ga.daily_totals),
      'ga_last_run', (select max(finished_at) from ga.import_runs where status in ('success', 'warning')))
  ) into v_out;
  return v_out;
end;
$function$;

revoke all on function public.get_site_traffic(integer) from public, anon;
grant execute on function public.get_site_traffic(integer) to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.meta_refresh_flow()') is not null then
    perform public.meta_refresh_flow();
    update public.meta_flow_nodes set layer = 'operations', status = 'current', is_public = false, ai_relevant = false,
      purpose = 'Integrity area ga: Google Analytics import freshness, data lag, device/country sessions reconciling with daily totals, complete calendar, recent failed runs. Reads the private ga schema.',
      refresh_note = 'Called by scripts/run_integrity_checks.py (09:45 UTC); data loaded by scripts/ga_import.py (ga-import.yml, 07:27 UTC).',
      purpose_reviewed_at = now()
    where node_key = 'function:check_ga_integrity()';
    update public.meta_flow_nodes set layer = 'admin', status = 'current', is_public = false, ai_relevant = false,
      purpose = 'Admin Site traffic page (/admin/traffic): Search Console and Google Analytics for the last N days with the previous period, daily series, sections, pages, landing pages, sources, devices, countries and search queries. Admin only.',
      refresh_note = 'Reads gsc.* (gsc-import.yml, daily) and ga.* (ga-import.yml, daily).',
      purpose_reviewed_at = now()
    where node_key = 'function:get_site_traffic(p_days integer)';
  end if;
end $$;
