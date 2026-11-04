-- ============================================================================
-- Admin daily site update: more about pages visited and X (Chris, 4 Nov 2026:
-- "I need more about site pages visited and social media posting").
--
-- 1. Cloudflare Web Analytics import (schema `cf`). Cloudflare counts every
--    visitor without cookies (~96 visits a day); Google Analytics only counts
--    those who accept the cookie banner (1 visitor on 4 Nov). The cf-analytics
--    Edge Function reads the GraphQL Analytics API
--    (rumPageloadEventsAdaptiveGroups) for the fixtureshark.com site tag, one
--    request per London date, and writes through public.cf_import_store:
--      cf.daily_totals       visits and page views per London date
--      cf.hourly_totals      the same per UTC hour (today-so-far comparisons)
--      cf.daily_by_page      per path
--      cf.daily_by_referrer  per referrer host ('' = none, i.e. direct)
--      cf.daily_by_country   per country
--      cf.import_runs        one row per run; pipeline_runs job 'cf_import'
--    Same conventions as ga/gsc: own schema, not exposed to the Data API, RLS
--    on with no policies, service_role reads; each run rewrites its dates.
--    pg_cron 'cf-import' (12 past 01, 07, 13, 17, 18 and 19 UTC, so one run
--    lands just before the 19:25 UK digest in GMT and in BST) calls it in
--    'auto' mode: a full backfill while fewer than 28 days are held, else the
--    last 3 days. Integrity area 'cf' (public.check_cf_integrity()).
--
-- 2. X metrics daily (Chris approved the small cost on 4 Nov). social-x-metrics
--    now runs at 18:55 UK (minute 55 of 17:00 and 18:00 UTC, the run at 18:xx
--    London goes) and reads the first post of each thread published in the
--    last 7 days (~$0.60 a month at ~19 posts a week). social-x-metrics-weekly
--    (Monday 07:40 UTC) makes one settled read of every post of each thread
--    published 7 to 14 days ago (~$0.15 a month). About $0.75 a month in all;
--    each run still logs its estimate in social_metrics_runs.
--
-- 3. private.admin_daily_digest: "Site pages" (Cloudflare first, Google
--    Analytics second as consenting visitors; same time last week; top 10
--    pages; pages new in 30 days; where visits came from; Google Search for
--    the latest complete day) and "X", always shown (today's posts with links,
--    allowance used, 7-day figures with best and weakest, queue, drafts
--    dropped today with the reason, visits from X, breaker). The headline
--    leads with visits and X impressions. Other sections unchanged.
--
-- 4. First runs: the Cloudflare backfill and a daily X read now, then a
--    one-off pg_cron job sends a "[Preview]" of today's digest once both have
--    finished (or after 15 minutes) and removes itself.
--
-- No secrets or addresses here. Safe to re-run: if not exists, create or
-- replace, on conflict do nothing, guarded cron changes.
-- ============================================================================

-- ======================================================================= cf
create schema if not exists cf;
revoke all on schema cf from public, anon, authenticated;
grant usage on schema cf to service_role;

create table if not exists cf.import_runs (
  run_id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null check (mode in ('daily', 'backfill', 'auto')),
  site_tag text,
  account_source text,             -- token (GET /accounts), secret, or constant
  start_date date,
  end_date date,
  status text not null default 'running' check (status in ('running', 'success', 'warning', 'failed')),
  rows_written jsonb not null default '{}'::jsonb,
  api_requests integer not null default 0,
  warnings text,
  error_message text
);

-- Dates are London dates. visits = Cloudflare "visits" (a page view whose
-- referrer is another site or none); page_views = page loads.
create table if not exists cf.daily_totals (
  date date primary key,
  visits bigint not null,
  page_views bigint not null,
  sample_interval numeric not null default 1,
  is_final boolean not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references cf.import_runs (run_id) on delete set null
);

create table if not exists cf.hourly_totals (
  hour timestamptz primary key,    -- start of the UTC hour
  date date not null,              -- its London date
  visits bigint not null,
  page_views bigint not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references cf.import_runs (run_id) on delete set null
);

create table if not exists cf.daily_by_page (
  date date not null,
  path text not null,
  dim_key text generated always as (md5(path)) stored,
  visits bigint not null,
  page_views bigint not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references cf.import_runs (run_id) on delete set null,
  primary key (date, dim_key)
);

create table if not exists cf.daily_by_referrer (
  date date not null,
  referrer_host text not null,     -- '' = no referrer (direct)
  dim_key text generated always as (md5(referrer_host)) stored,
  visits bigint not null,
  page_views bigint not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references cf.import_runs (run_id) on delete set null,
  primary key (date, dim_key)
);

create table if not exists cf.daily_by_country (
  date date not null,
  country text not null,
  dim_key text generated always as (md5(country)) stored,
  visits bigint not null,
  page_views bigint not null,
  fetched_at timestamptz not null default now(),
  run_id bigint references cf.import_runs (run_id) on delete set null,
  primary key (date, dim_key)
);

create index if not exists cf_daily_by_page_path_idx on cf.daily_by_page (path, date);
create index if not exists cf_hourly_totals_date_idx on cf.hourly_totals (date);
create index if not exists cf_import_runs_started_idx on cf.import_runs (started_at desc);

do $$
declare t text;
begin
  foreach t in array array['import_runs', 'daily_totals', 'hourly_totals', 'daily_by_page', 'daily_by_referrer', 'daily_by_country'] loop
    execute format('alter table cf.%I enable row level security', t);
    execute format('revoke all on cf.%I from public, anon, authenticated', t);
    execute format('grant select on cf.%I to service_role', t);
  end loop;
end $$;

-- cf-analytics hands over one run: rewrites its dates in one transaction,
-- logs cf.import_runs and pipeline_runs ('cf_import'). service_role only.
create or replace function public.cf_import_store(p_run jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_id bigint;
  v_err text := nullif(p_run->>'error', '');
  v_warn text := nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(p_run->'warnings', '[]'::jsonb))), ' | '), '');
  v_nwarn int := jsonb_array_length(coalesce(p_run->'warnings', '[]'::jsonb));
  v_dates date[];
  v_status text;
  v_rows jsonb;
  v_mode text := coalesce(nullif(p_run->>'mode', ''), 'daily');
begin
  select array_agg((d->>'date')::date) into v_dates from jsonb_array_elements(coalesce(p_run->'days', '[]'::jsonb)) d;
  v_status := case when v_err is not null or v_dates is null then 'failed' when v_warn is not null then 'warning' else 'success' end;
  if v_err is null and v_dates is null then v_err := 'no dates fetched'; end if;
  insert into cf.import_runs (started_at, finished_at, mode, site_tag, account_source, start_date, end_date, status, api_requests, warnings, error_message)
  values (coalesce((p_run->>'started_at')::timestamptz, now()), now(), v_mode, p_run->>'site_tag', p_run->>'account_source',
          (p_run->>'start_date')::date, (p_run->>'end_date')::date, v_status, coalesce((p_run->>'api_requests')::int, 0),
          left(v_warn, 4000), left(v_err, 2000))
  returning run_id into v_id;

  if v_status <> 'failed' then
    delete from cf.daily_totals where date = any (v_dates);
    delete from cf.hourly_totals where date = any (v_dates);
    delete from cf.daily_by_page where date = any (v_dates);
    delete from cf.daily_by_referrer where date = any (v_dates);
    delete from cf.daily_by_country where date = any (v_dates);
    insert into cf.daily_totals (date, visits, page_views, sample_interval, is_final, run_id)
    select (x->>'date')::date, coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0),
           coalesce((x->>'sample_interval')::numeric, 1), coalesce((x->>'is_final')::boolean, false), v_id
      from jsonb_array_elements(p_run->'days') x;
    insert into cf.hourly_totals (hour, date, visits, page_views, run_id)
    select (x->>'hour')::timestamptz, (x->>'date')::date, coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0), v_id
      from jsonb_array_elements(coalesce(p_run->'hours', '[]'::jsonb)) x
     where (x->>'date')::date = any (v_dates)
    on conflict (hour) do update set visits = cf.hourly_totals.visits + excluded.visits, page_views = cf.hourly_totals.page_views + excluded.page_views;
    insert into cf.daily_by_page (date, path, visits, page_views, run_id)
    select (x->>'date')::date, x->>'path', coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0), v_id
      from jsonb_array_elements(coalesce(p_run->'pages', '[]'::jsonb)) x where (x->>'date')::date = any (v_dates)
    on conflict (date, dim_key) do update set visits = cf.daily_by_page.visits + excluded.visits, page_views = cf.daily_by_page.page_views + excluded.page_views;
    insert into cf.daily_by_referrer (date, referrer_host, visits, page_views, run_id)
    select (x->>'date')::date, coalesce(x->>'host', ''), coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0), v_id
      from jsonb_array_elements(coalesce(p_run->'refs', '[]'::jsonb)) x where (x->>'date')::date = any (v_dates)
    on conflict (date, dim_key) do update set visits = cf.daily_by_referrer.visits + excluded.visits, page_views = cf.daily_by_referrer.page_views + excluded.page_views;
    insert into cf.daily_by_country (date, country, visits, page_views, run_id)
    select (x->>'date')::date, x->>'country', coalesce((x->>'visits')::bigint, 0), coalesce((x->>'page_views')::bigint, 0), v_id
      from jsonb_array_elements(coalesce(p_run->'countries', '[]'::jsonb)) x where (x->>'date')::date = any (v_dates)
    on conflict (date, dim_key) do update set visits = cf.daily_by_country.visits + excluded.visits, page_views = cf.daily_by_country.page_views + excluded.page_views;
  end if;

  v_rows := jsonb_build_object(
    'days', coalesce(array_length(v_dates, 1), 0),
    'hours', jsonb_array_length(coalesce(p_run->'hours', '[]'::jsonb)),
    'pages', jsonb_array_length(coalesce(p_run->'pages', '[]'::jsonb)),
    'referrers', jsonb_array_length(coalesce(p_run->'refs', '[]'::jsonb)),
    'countries', jsonb_array_length(coalesce(p_run->'countries', '[]'::jsonb)));
  update cf.import_runs set rows_written = v_rows where run_id = v_id;

  insert into public.pipeline_runs (job_name, started_at, finished_at, status, summary, error_message, rows_inserted)
  values ('cf_import', coalesce((p_run->>'started_at')::timestamptz, now()), now(), v_status,
          format('%s: %s dates (%s to %s), %s page rows, %s referrer rows, %s API requests%s', v_mode,
                 v_rows->>'days', coalesce(p_run->>'start_date', '?'), coalesce(p_run->>'end_date', '?'),
                 v_rows->>'pages', v_rows->>'referrers', coalesce(p_run->>'api_requests', '0'),
                 case when v_nwarn > 0 then format('; %s warnings', v_nwarn) else '' end),
          case when v_status = 'failed' then left(v_err, 500) when v_warn is not null then left(v_warn, 500) end,
          (v_rows->>'pages')::bigint);
  return jsonb_build_object('run_id', v_id, 'status', v_status) || v_rows;
end;
$function$;
revoke all on function public.cf_import_store(jsonb) from public, anon, authenticated;
grant execute on function public.cf_import_store(jsonb) to service_role;

-- How much history is held (cf-analytics 'auto' backfills below 28 days).
create or replace function public.cf_import_state()
returns jsonb language sql stable security definer set search_path = '' as $function$
  select jsonb_build_object('days', count(*), 'first', min(date), 'last', max(date)) from cf.daily_totals
$function$;
revoke all on function public.cf_import_state() from public, anon, authenticated;
grant execute on function public.cf_import_state() to service_role;

-- Integrity area 'cf' (scripts/run_integrity_checks.py).
create or replace function public.check_cf_integrity()
returns table (check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $function$
  select 'cf_import_fresh',
    case when age_h is null then 'warning' when age_h >= 30 then 'failed' when age_h >= 12 then 'warning' else 'ok' end,
    coalesce(age_h, -1)::bigint,
    'Hours since the last successful Cloudflare Web Analytics import (cf-import runs 6 times a day; warns at 12, fails at 30; -1 = never run)'
  from (select floor(extract(epoch from now() - max(finished_at)) / 3600) age_h
          from cf.import_runs where status in ('success', 'warning')) x
  union all
  select 'cf_data_fresh',
    case when lag_days is null then 'warning' when lag_days >= 4 then 'failed' when lag_days >= 2 then 'warning' else 'ok' end,
    coalesce(lag_days, -1)::bigint,
    'Days between today (UK) and the latest Cloudflare date with visits (warns at 2, fails at 4; -1 = no data)'
  from (select ((now() at time zone 'Europe/London')::date - max(date)) lag_days from cf.daily_totals where page_views > 0) x
  union all
  select 'cf_pages_reconcile', case when n = 0 then 'ok' else 'warning' end, n,
    'Days in the last 60 where page views by path do not add up to the day''s total (each comes from the same request, so they should match)'
  from (select count(*) n from cf.daily_totals t
          left join lateral (select coalesce(sum(page_views), 0) v from cf.daily_by_page p where p.date = t.date) p on true
         where t.date >= current_date - 60 and p.v <> t.page_views) x
  union all
  select 'cf_calendar_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Missing days in cf.daily_totals between its first and last date (every fetched date is stored, zero or not, so a gap is a load fault)'
  from (select count(*) n
          from (select min(date) lo, max(date) hi from cf.daily_totals) b
          cross join lateral generate_series(b.lo, b.hi, interval '1 day') g(d)
         where b.lo is not null and not exists (select 1 from cf.daily_totals t where t.date = g.d::date)) x
  union all
  select 'cf_runs_failed_24h', case when n = 0 then 'ok' else 'warning' end, n,
    'Failed Cloudflare imports in the last 24 hours (cf.import_runs.error_message has the reason)'
  from (select count(*) n from cf.import_runs where status = 'failed' and started_at >= now() - interval '24 hours') x
$function$;
revoke all on function public.check_cf_integrity() from public, anon, authenticated;
grant execute on function public.check_cf_integrity() to service_role;

-- pg_cron -> cf-analytics with the worker token (as private.social_metrics_call).
create or replace function private.cf_import_call(p_mode text default 'auto')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/cf-analytics',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := jsonb_build_object('mode', p_mode, 'triggered_by', 'schedule'), timeout_milliseconds := 150000);
end;
$$;
revoke all on function private.cf_import_call(text) from public, anon, authenticated;

do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'cf-import';
  if v_id is null then
    perform cron.schedule('cf-import', '12 1,7,13,17,18,19 * * *', 'select private.cf_import_call(''auto'')');
  end if;
end $$;

-- =================================================================== X metrics
drop function if exists private.social_metrics_call();
create or replace function private.social_metrics_call(p_scope text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_scope not in ('daily', 'weekly') then raise exception 'unknown scope %', p_scope; end if;
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-metrics',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := jsonb_build_object('triggered_by', 'schedule', 'scope', p_scope), timeout_milliseconds := 60000);
end;
$$;
revoke all on function private.social_metrics_call(text) from public, anon, authenticated;

-- 18:55 UK all year: pg_cron is UTC, so minute 55 of 17:00 and 18:00 UTC and
-- only the run in the London 18:00 hour reads.
create or replace function private.social_metrics_daily_tick()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if extract(hour from now() at time zone 'Europe/London') <> 18 then return 'not due'; end if;
  perform private.social_metrics_call('daily');
  return 'called';
end;
$$;
revoke all on function private.social_metrics_daily_tick() from public, anon, authenticated;

do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'social-x-metrics';
  if v_id is null then
    perform cron.schedule('social-x-metrics', '55 17,18 * * *', 'select private.social_metrics_daily_tick()');
  else
    perform cron.alter_job(v_id, schedule := '55 17,18 * * *', command := 'select private.social_metrics_daily_tick()');
  end if;
  if not exists (select 1 from cron.job where jobname = 'social-x-metrics-weekly') then
    perform cron.schedule('social-x-metrics-weekly', '40 7 * * 1', 'select private.social_metrics_call(''weekly'')');
  end if;
end $$;

-- ================================================================ job registry
insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values
  ('cf-import', 'analytics', 'supabase_cron', '12 1,7,13,17,18,19 * * *', interval '8 hours', interval '00:05:00', 'pg_cron', '^cf-import$', null,
   'Six times a day: private.cf_import_call(''auto'') calls the cf-analytics Edge Function (Cloudflare Web Analytics)'),
  ('cf-analytics', 'analytics', 'edge_function', '12 1,7,13,17,18,19 * * * (via cf-import)', interval '8 hours', interval '00:05:00', 'pipeline_runs', '^cf_import$', 'api.cloudflare.com',
   'Cloudflare Web Analytics import (visits, page views by path, referrer and country per London date) into the cf schema; logged by public.cf_import_store. Integrity area cf'),
  ('social-x-metrics-weekly', 'social', 'supabase_cron', '40 7 * * 1', interval '8 days', interval '00:10:00', 'pg_cron', '^social-x-metrics-weekly$', 'api.x.com',
   'Weekly: private.social_metrics_call(''weekly'') makes one settled read of every post of each thread published 7 to 14 days ago (~$0.15 a month)')
on conflict (job_key) do nothing;

update public.job_registry
   set schedule = '55 17,18 * * *', expected_interval = interval '26 hours',
       notes = 'Daily 18:55 UK (minute 55 of 17:00 and 18:00 UTC; the London 18:00 run reads): private.social_metrics_daily_tick() reads the first post of each thread from the last 7 days before the 19:25 digest (~$0.60 a month)'
 where job_key = 'social-x-metrics' and schedule is distinct from '55 17,18 * * *';

-- ================================================================ digest helpers
-- 1234 -> '1,234'.
create or replace function private.digest_int(p_n numeric)
returns text language sql immutable set search_path = public, pg_temp as $$
  select to_char(coalesce(p_n, 0), 'FM999,999,999,990');
$$;
revoke all on function private.digest_int(numeric) from public, anon, authenticated;

-- '+20%', '-5%', 'level'; null when there is nothing to compare with.
create or replace function private.digest_pct(p_now numeric, p_then numeric)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when p_then is null or p_then = 0 then null
              when round(100.0 * (p_now - p_then) / p_then) = 0 then 'level'
              else case when p_now > p_then then '+' else '' end || round(100.0 * (p_now - p_then) / p_then)::bigint || '%' end;
$$;
revoke all on function private.digest_pct(numeric, numeric) from public, anon, authenticated;

-- First line of a post, whitespace tidied, cut to p_len characters.
create or replace function private.digest_clip(p_text text, p_len int)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when length(t) > p_len then rtrim(left(t, p_len - 1)) || '…' else t end
    from (select btrim(regexp_replace(split_part(coalesce(p_text, ''), E'\n', 1), '\s+', ' ', 'g')) t) x;
$$;
revoke all on function private.digest_clip(text, int) from public, anon, authenticated;

-- Where a visit came from, from its referrer host (Cloudflare) or session
-- source (Google Analytics). AI tools before Google (gemini.google.com).
create or replace function private.digest_ref_channel(p_host text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when h in ('', '(direct)', '(none)', '(not set)') or h ~ '(^|\.)fixtureshark\.com$' then 'direct'
    when h in ('t.co', 'x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com', 'pro.x.com', 'tweetdeck.twitter.com') then 'X'
    when h ~ '(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|deepseek\.com|grok\.com|meta\.ai|you\.com|phind\.com|poe\.com|mistral\.ai)$' then 'AI'
    when h ~ '(^|\.)google(\.[a-z]{2,3}){1,2}$' or h = 'google' then 'Google'
    else 'other' end
  from (select lower(btrim(coalesce(p_host, ''))) h) x;
$$;
revoke all on function private.digest_ref_channel(text) from public, anon, authenticated;

-- Post type names as in social-notify.
create or replace function private.digest_post_label(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select coalesce((jsonb_build_object(
    'fpl_price_changes', 'FPL price changes', 'fpl_captaincy', 'FPL captaincy', 'gameweek_thread', 'Gameweek thread',
    'fpl_availability', 'FPL availability', 'fpl_market', 'FPL market watch', 'fpl_week_changes', 'FPL week''s changes',
    'gameweek_outlook', 'The week ahead', 'fixture_moved', 'Fixture moved', 'match_predictions', 'Match-day predictions',
    'daily_market', 'Daily market view', 'lineup_vs_model', 'Line-ups v our model', 'team_news', 'Team news',
    'fpl_price_watch', 'FPL price watch', 'quiz', 'Quiz question', 'quiz_answer', 'Quiz answer', 'fact', 'Did you know',
    'prediction_accuracy', 'Prediction accuracy', 'team_xg_change', 'Team xG change', 'historical_insight', 'Historical insight')
    ->> p_type), initcap(replace(coalesce(p_type, 'post'), '_', ' ')));
$$;
revoke all on function private.digest_post_label(text) from public, anon, authenticated;

-- ================================================================ digest
create or replace function private.admin_daily_digest(p_day date default (now() at time zone 'Europe/London')::date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from timestamptz := (p_day::timestamp) at time zone 'Europe/London';
  v_to   timestamptz := least(now(), ((p_day + 1)::timestamp) at time zone 'Europe/London');
  v_sections jsonb := '[]'::jsonb;
  v_lines text[];
  -- site pages: Cloudflare
  c_visits bigint; c_views bigint; c_loaded timestamptz; c_final boolean; c_first date;
  cw_visits bigint; cw_views bigint; cw_partial boolean;
  c_top text; c_new_n int; c_new text; c_src text; c_ai text; c_other text; c_from_x bigint;
  -- site pages: Google Analytics (consenting visitors)
  t_users bigint; t_views bigint; t_sessions bigint; t_loaded timestamptz; t_final boolean;
  w_users bigint; w_views bigint; v_top text; g_src text; g_from_x bigint;
  -- site pages: Search Console
  q_day date; q_imp bigint; q_clicks bigint; q_pos numeric; q_queries text; q_pages text;
  -- people
  p_accounts int; p_signups int; p_confirmed int; p_unsubs int; p_list int; p_lookups int; v_weekly text;
  -- x
  x_pub int; x_list text; x_month int; x_waiting int;
  m_posts int; m_read int; m_imp bigint; m_likes bigint; m_replies bigint; m_reposts bigint; m_at timestamptz;
  m_best text; m_worst text; m_rows text; x_next text; x_dropped text;
  s record;
  -- pipelines
  r_total int; r_ok int; r_warn int; r_fail int; r_running int; r_failing int; v_fail_list text;
  v_integrity record; v_smoke record; v_prev_n int; v_prev_fail int;
  -- football
  f_results int; f_by_league text; f_moved int; f_moved_list text; l_teams int; l_starters int; l_matched int;
  -- fpl
  v_season bigint := public.fpl_current_season_id(); v_up int; v_down int; v_up_list text; v_down_list text;
  g_next record; g_passed record; g_current record;
  -- shipped
  m_count int; m_list text;
  v_headline text[] := '{}';
  hm text := 'HH24:MI';
begin
  -- ============================================================ site pages
  -- Cloudflare counts every visitor (no cookies): the main figures.
  select visits, page_views, fetched_at, is_final into c_visits, c_views, c_loaded, c_final from cf.daily_totals where date = p_day;
  select min(date) into c_first from cf.daily_totals;
  -- Same weekday last week up to the same time of day while today is still
  -- running (hourly figures); the whole day once today is complete.
  if c_loaded is not null and not c_final and exists (select 1 from cf.hourly_totals where date = p_day - 7) then
    select sum(visits), sum(page_views) into cw_visits, cw_views
      from cf.hourly_totals where date = p_day - 7 and hour < v_to - interval '7 days';
    cw_partial := true;
  else
    select visits, page_views into cw_visits, cw_views from cf.daily_totals where date = p_day - 7;
    cw_partial := false;
  end if;
  -- Google Analytics: only visitors who accept cookies.
  select sum(active_users), sum(page_views), sum(sessions), max(fetched_at), bool_and(is_final)
    into t_users, t_views, t_sessions, t_loaded, t_final
    from ga.daily_totals where date = p_day;
  select sum(active_users), sum(page_views) into w_users, w_views from ga.daily_totals where date = p_day - 7;

  v_lines := '{}';
  if c_loaded is not null then
    v_lines := v_lines || format('%s, %s%s (Cloudflare, every visitor).', private.digest_n(c_visits, 'visit'),
                                 private.digest_n(c_views, 'pageview'), case when c_final then '' else ' so far' end);
    v_lines := v_lines || case when cw_visits is null then format('Same day last week (%s): no Cloudflare figures.', to_char(p_day - 7, 'Dy FMDD Mon'))
      else format('%s %s: %s, %s%s.', case when cw_partial then 'Same time last' else 'Last' end, to_char(p_day - 7, 'Dy FMDD Mon'),
                  private.digest_n(cw_visits, 'visit'), private.digest_n(cw_views, 'pageview'),
                  coalesce(' (visits ' || private.digest_pct(c_visits, cw_visits) || ')', '')) end;
  else
    v_lines := v_lines || 'Cloudflare: no figures for today yet.'::text;
  end if;
  if t_loaded is not null then
    v_lines := v_lines || format('Consenting visitors (Google Analytics): %s, %s%s; same day last week %s, %s.',
      private.digest_n(t_users, 'visitor'), private.digest_n(t_views, 'pageview'),
      case when t_final then '' else ', loaded ' || to_char(t_loaded at time zone 'Europe/London', hm) end,
      private.digest_n(w_users, 'visitor'), private.digest_n(w_views, 'pageview'));
  end if;

  -- Top 10 pages (Cloudflare, else Google Analytics).
  if c_loaded is not null then
    select string_agg(format('%s · %s', path, private.digest_int(page_views)), E'\n' order by page_views desc, path) into c_top
      from (select path, page_views from cf.daily_by_page where date = p_day and page_views > 0 order by page_views desc, path limit 10) x;
  else
    select string_agg(format('%s · %s', page_path, page_views), E'\n' order by page_views desc, page_path) into c_top
      from (select page_path, sum(page_views) page_views from ga.daily_by_page
             where date = p_day group by 1 having sum(page_views) > 0 order by 2 desc, 1 limit 10) x;
  end if;
  if c_top is not null then v_lines := v_lines || ('Top pages today (pageviews):' || E'\n' || c_top); end if;

  -- Pages with visits today and none in the previous 30 days (Cloudflare).
  if c_loaded is not null then
    with t as (select path, page_views from cf.daily_by_page d where d.date = p_day and d.page_views > 0
                  and not exists (select 1 from cf.daily_by_page o where o.path = d.path and o.page_views > 0
                                     and o.date between p_day - 30 and p_day - 1))
    select count(*), string_agg(format('%s · %s', path, page_views), E'\n' order by page_views desc, path) filter (where rn <= 10)
      into c_new_n, c_new
      from (select *, row_number() over (order by page_views desc, path) rn from t) x;
    v_lines := v_lines || (case when c_new_n = 0 then 'New pages today: none'
                                else format('New pages today (%s), with no visits in the previous 30 days', c_new_n) end
      || case when c_first > p_day - 30 then format(' (Cloudflare figures from %s only)', to_char(c_first, 'FMDD Mon')) else '' end
      || case when c_new_n = 0 then '.'
              else ':' || E'\n' || c_new || case when c_new_n > 10 then E'\n' || format('and %s more', c_new_n - 10) else '' end end);
  end if;

  -- Where visits came from.
  if c_loaded is not null then
    with r as (select private.digest_ref_channel(referrer_host) ch, referrer_host, visits from cf.daily_by_referrer where date = p_day and visits > 0),
    ch as (select c.ch, c.ord, coalesce(sum(r.visits), 0) v
             from (values ('X', 1), ('Google', 2), ('AI', 3), ('direct', 4), ('other', 5)) c(ch, ord)
             left join r on r.ch = c.ch group by 1, 2)
    select string_agg(format('%s %s', case ch when 'AI' then 'ChatGPT and other AI' else ch end, v), ' · ' order by ord),
           max(v) filter (where ch = 'X'),
           (select string_agg(format('%s %s', referrer_host, v), ', ' order by v desc, referrer_host)
              from (select referrer_host, sum(visits) v from r where ch = 'AI' group by 1 order by 2 desc, 1 limit 4) a),
           (select string_agg(format('%s %s', referrer_host, v), ', ' order by v desc, referrer_host)
              from (select referrer_host, sum(visits) v from r where ch = 'other' group by 1 order by 2 desc, 1 limit 4) o)
      into c_src, c_from_x, c_ai, c_other from ch;
    v_lines := v_lines || ('Where visits came from: ' || c_src || '.'
      || coalesce(E'\n' || 'AI: ' || c_ai || '.', '') || coalesce(E'\n' || 'Other: ' || c_other || '.', ''));
  end if;
  -- Google Analytics sessions by source (consenting visitors only).
  with r as (select private.digest_ref_channel(source) ch, sessions from ga.daily_by_channel where date = p_day and sessions > 0),
  ch as (select c.ch, c.ord, coalesce(sum(r.sessions), 0) v
           from (values ('X', 1), ('Google', 2), ('AI', 3), ('direct', 4), ('other', 5)) c(ch, ord)
           left join r on r.ch = c.ch group by 1, 2)
  select case when sum(v) > 0 then string_agg(format('%s %s', case ch when 'AI' then 'ChatGPT and other AI' else ch end, v), ' · ' order by ord) end,
         max(v) filter (where ch = 'X')
    into g_src, g_from_x from ch;
  if g_src is not null and c_loaded is null then
    v_lines := v_lines || ('Where sessions came from (Google Analytics, consenting visitors only): ' || g_src || '.');
  end if;

  -- Google Search, latest complete day (2 to 3 days behind).
  select max(date) into q_day from gsc.daily_totals where search_type = 'web' and is_final and date <= p_day;
  if q_day is not null then
    select sum(impressions), sum(clicks), sum(position * impressions) / nullif(sum(impressions), 0)
      into q_imp, q_clicks, q_pos from gsc.daily_totals where search_type = 'web' and date = q_day;
    select string_agg(format('“%s” %s', query, impressions), ', ' order by impressions desc, clicks desc, query) into q_queries
      from (select query, sum(impressions) impressions, sum(clicks) clicks from gsc.daily_by_query
             where search_type = 'web' and date = q_day group by 1 having sum(impressions) > 0 order by 2 desc, 3 desc, 1 limit 3) x;
    select string_agg(format('%s %s', p, impressions), ', ' order by impressions desc, p) into q_pages
      from (select coalesce(nullif(regexp_replace(page, '^https?://(www\.)?fixtureshark\.com', ''), ''), '/') p, sum(impressions) impressions
              from gsc.daily_by_page where search_type = 'web' and date = q_day group by 1 having sum(impressions) > 0 order by 2 desc, 1 limit 3) x;
    v_lines := v_lines || (format('Google Search, %s (latest complete day): %s, %s%s.', to_char(q_day, 'Dy FMDD Mon'),
                                  private.digest_n(q_imp, 'impression'), private.digest_n(q_clicks, 'click'),
                                  case when q_imp > 0 then ', average position ' || round(q_pos, 1) else '' end)
      || coalesce(E'\n' || 'Top searches (impressions): ' || q_queries || '.', '')
      || coalesce(E'\n' || 'Top pages in Search (impressions): ' || q_pages || '.', ''));
  end if;
  v_sections := v_sections || jsonb_build_object('key', 'traffic', 'title', 'Site pages',
    'link', 'https://fixtureshark.com/admin/traffic', 'lines', to_jsonb(v_lines));
  v_headline := v_headline || case
    when c_loaded is not null then private.digest_n(c_visits, 'visit') || ', ' || private.digest_n(c_views, 'pageview')
    when t_loaded is not null then private.digest_n(t_users, 'consenting visitor') || ', ' || private.digest_n(t_views, 'pageview')
    else 'no visit figures yet' end;

  -- ============================================================ X (always shown)
  select max_posts_per_day, max_posts_per_month, breaker_tripped_at, breaker_reason, auto_publish_enabled, kill_switch
    into s from public.social_settings where id;
  select count(*),
         string_agg(format('%s · %s · %s', to_char(published_at at time zone 'Europe/London', hm), private.digest_post_label(post_type),
                           private.digest_clip(text, 80))
                    || coalesce(E'\n' || 'https://x.com/FixtureSharkHQ/status/' || x_post_id, ''), E'\n' order by published_at)
    into x_pub, x_list
    from public.social_post_candidates where published_at >= v_from and published_at < v_to;
  select count(*) into x_month from public.social_post_candidates
   where published_at >= (date_trunc('month', p_day)::timestamp at time zone 'Europe/London') and published_at < v_to;

  -- Latest read of the first post of each post published in the last 7 days.
  with p as (select candidate_id, post_type, published_at, text from public.social_post_candidates
              where publication_status = 'published' and published_at >= v_to - interval '7 days' and published_at < v_to),
  l as (select distinct on (m.candidate_id) m.candidate_id, m.captured_at, coalesce(m.impressions, 0) imp,
               coalesce(m.likes, 0) likes, coalesce(m.replies, 0) replies, coalesce(m.reposts, 0) reposts
          from public.social_post_metrics m join p using (candidate_id)
         where m.position = 1 and m.captured_at < v_to order by m.candidate_id, m.captured_at desc),
  j as (select p.*, l.captured_at, l.imp, l.likes, l.replies, l.reposts,
               l.captured_at >= p.published_at + interval '24 hours' settled
          from p join l using (candidate_id)),
  ranked as (select j.*, row_number() over (order by settled desc, imp desc, published_at) best_rn,
                         row_number() over (order by settled desc, imp asc, published_at) worst_rn from j)
  select (select count(*) from p), count(*), sum(imp), sum(likes), sum(replies), sum(reposts), max(captured_at),
         max(format('Best: %s %s, %s impressions, %s likes: %s', to_char(published_at at time zone 'Europe/London', 'Dy FMDD Mon'),
                    private.digest_post_label(post_type), private.digest_int(imp), likes, private.digest_clip(text, 60))) filter (where best_rn = 1),
         max(format('Weakest: %s %s, %s impressions, %s likes: %s', to_char(published_at at time zone 'Europe/London', 'Dy FMDD Mon'),
                    private.digest_post_label(post_type), private.digest_int(imp), likes, private.digest_clip(text, 60))) filter (where worst_rn = 1),
         string_agg(format('%s · %s · %s impr · %s · %s · %s', to_char(published_at at time zone 'Europe/London', 'Dy HH24:MI'),
                           private.digest_post_label(post_type), private.digest_int(imp), private.digest_n(likes, 'like'),
                           replies || case when replies = 1 then ' reply' else ' replies' end, private.digest_n(reposts, 'repost')), E'\n' order by published_at desc)
    into m_posts, m_read, m_imp, m_likes, m_replies, m_reposts, m_at, m_best, m_worst, m_rows
    from ranked;

  -- Queued: approved, not held, going later.
  select string_agg(format('%s · %s · %s', to_char(coalesce(hold_until, scheduled_for) at time zone 'Europe/London', 'Dy FMDD Mon HH24:MI'),
                           private.digest_post_label(post_type), private.digest_clip(text, 60)), E'\n' order by coalesce(hold_until, scheduled_for))
    into x_next
    from (select * from public.social_post_candidates
           where approval_status = 'approved' and publication_status = 'unpublished' and not coalesce(held, false)
             and coalesce(hold_until, scheduled_for) > now()
           order by coalesce(hold_until, scheduled_for) limit 5) c;
  select count(*) into x_waiting from public.social_post_candidates
   where approval_status not in ('approved', 'rejected', 'superseded') and publication_status <> 'published'
     and coalesce(expires_at, now()) >= now() and not coalesce(auto, false);

  -- Drafts dropped today, with the reason.
  select string_agg(line, E'\n' order by at) into x_dropped
    from (select * from (
      select a.at, format('#%s %s: rejected (%s)', c.candidate_id, private.digest_post_label(c.post_type),
                          coalesce(nullif(a.detail->>'reason', ''), c.rejected_reason, 'no reason given')) line
        from public.social_audit_log a join public.social_post_candidates c using (candidate_id)
       where a.action = 'reject' and a.at >= v_from and a.at < v_to
      union all
      select c.updated_at, format('#%s %s: superseded (%s)', c.candidate_id, private.digest_post_label(c.post_type),
                                  coalesce('replaced by #' || nx.id, 'replaced by a newer draft'))
        from public.social_post_candidates c
        left join lateral (select min(c2.candidate_id) id from public.social_post_candidates c2
                            where c2.post_type = c.post_type and c2.candidate_id > c.candidate_id and c2.approval_status <> 'superseded') nx on true
       where c.approval_status = 'superseded' and c.updated_at >= v_from and c.updated_at < v_to and coalesce(c.expires_at, v_to) >= v_from
      union all
      select c.expires_at, format('#%s %s: expired unposted at %s', c.candidate_id, private.digest_post_label(c.post_type),
                                  to_char(c.expires_at at time zone 'Europe/London', hm))
        from public.social_post_candidates c
       where c.expires_at >= v_from and c.expires_at < v_to and c.publication_status <> 'published'
         and c.approval_status not in ('rejected', 'superseded')
      union all
      select c.updated_at, format('#%s %s: held by you', c.candidate_id, private.digest_post_label(c.post_type))
        from public.social_post_candidates c
       where coalesce(c.held, false) and c.updated_at >= v_from and c.updated_at < v_to) y
     order by at limit 8) x;

  v_lines := array[format('Posts today: %s of %s allowed. This month: %s of %s.', x_pub, coalesce(s.max_posts_per_day::text, '?'),
                          x_month, coalesce(s.max_posts_per_month::text, '?'))];
  v_lines := v_lines || coalesce(x_list, 'No posts today.');
  if m_read > 0 then
    v_lines := v_lines || format('Last 7 days: %s, %s impressions, %s likes, %s replies, %s reposts (first post of each thread, read %s%s).',
      private.digest_n(m_posts, 'post'), private.digest_int(m_imp), private.digest_int(m_likes), private.digest_int(m_replies), private.digest_int(m_reposts),
      to_char(m_at at time zone 'Europe/London', 'Dy HH24:MI'),
      case when m_posts > m_read then format('; %s not read yet', m_posts - m_read) else '' end);
    if m_read >= 2 then v_lines := v_lines || (m_best || E'\n' || m_worst); end if;
    v_lines := v_lines || ('Each post (UK time):' || E'\n' || m_rows);
  elsif m_posts > 0 then
    v_lines := v_lines || format('Last 7 days: %s, no figures read from X yet.', private.digest_n(m_posts, 'post'));
  else
    v_lines := v_lines || 'Last 7 days: no posts.'::text;
  end if;
  v_lines := v_lines || coalesce('Queued next:' || E'\n' || x_next, 'Nothing queued.');
  if x_waiting > 0 then v_lines := v_lines || (private.digest_n(x_waiting, 'draft') || ' waiting for your OK.'); end if;
  v_lines := v_lines || coalesce('Not posted today:' || E'\n' || x_dropped, 'No drafts held, rejected, superseded or expired today.');
  v_lines := v_lines || case
    when c_loaded is not null then format('Site visits from X today: %s (Cloudflare, links from t.co and x.com).', coalesce(c_from_x, 0))
    when g_src is not null then format('Site sessions from X today: %s (Google Analytics, consenting visitors only).', g_from_x)
    else 'Site visits from X today: no figures yet.' end;
  v_lines := v_lines || case
    when s.breaker_tripped_at >= v_from and s.breaker_tripped_at < v_to
      then format('Breaker TRIPPED at %s: %s', to_char(s.breaker_tripped_at at time zone 'Europe/London', hm), coalesce(s.breaker_reason, 'no reason given'))
    when s.breaker_tripped_at is not null then 'Breaker still tripped since ' || to_char(s.breaker_tripped_at at time zone 'Europe/London', 'Dy FMDD Mon HH24:MI') || '.'
    when coalesce(s.kill_switch, false) then 'Breaker not tripped; kill switch is on.'
    when coalesce(s.auto_publish_enabled, false) then 'Breaker not tripped; automatic posting on.'
    else 'Breaker not tripped; automatic posting off.' end;
  v_sections := v_sections || jsonb_build_object('key', 'x', 'title', 'X',
    'link', 'https://fixtureshark.com/admin/social', 'lines', to_jsonb(v_lines));
  v_headline := v_headline || case when m_read > 0 then private.digest_int(m_imp) || ' X impressions (7 days)' else 'no X figures yet' end;
  v_headline := v_headline || private.digest_n(x_pub, 'X post');

  -- ============================================================ people
  select count(*) into p_accounts from public.app_users where created_at >= v_from and created_at < v_to;
  select count(*) filter (where created_at >= v_from and created_at < v_to),
         count(*) filter (where confirmed_at >= v_from and confirmed_at < v_to),
         count(*) filter (where unsubscribed_at >= v_from and unsubscribed_at < v_to),
         count(*) filter (where status = 'confirmed')
    into p_signups, p_confirmed, p_unsubs, p_list
    from private.email_subscribers;
  select count(*) into p_lookups from private.fpl_entry_calls where called_at >= v_from and called_at < v_to;
  select string_agg(format('%s email for GW%s: %s sent, %s failed (%s).', initcap(kind), coalesce(fpl_event_id::text, '?'), sent, failed, status), ' ')
    into v_weekly
    from private.email_sends where started_at >= v_from and started_at < v_to;
  if p_accounts + p_signups + p_confirmed + p_unsubs + p_lookups > 0 or v_weekly is not null then
    v_lines := '{}';
    if p_accounts > 0 then v_lines := v_lines || (private.digest_n(p_accounts, 'new account') || '.'); end if;
    if p_signups + p_confirmed + p_unsubs > 0 then
      v_lines := v_lines || format('FPL email: %s signed up, %s confirmed, %s unsubscribed. List: %s confirmed.',
                                   p_signups, p_confirmed, p_unsubs, p_list);
    end if;
    if v_weekly is not null then v_lines := v_lines || v_weekly; end if;
    if p_lookups > 0 then v_lines := v_lines || format('%s FPL team ID look-ups on the site.', p_lookups); end if;
    v_sections := v_sections || jsonb_build_object('key', 'people', 'title', 'People',
      'link', 'https://fixtureshark.com/admin/email', 'lines', to_jsonb(v_lines));
  end if;

  -- ============================================================ data and pipelines
  select count(*), count(*) filter (where status = 'success'), count(*) filter (where status = 'warning'),
         count(*) filter (where status = 'failed'), count(*) filter (where status = 'running')
    into r_total, r_ok, r_warn, r_fail, r_running
    from public.pipeline_runs where started_at >= v_from and started_at < v_to;
  select string_agg(format('%s (%s): %s%s', job_name, n, left(regexp_replace(msg, '\s+', ' ', 'g'), 90),
                           case when later_ok then ' (later run OK)' else '' end), E'\n' order by later_ok, job_name)
    into v_fail_list
    from (select f.job_name, count(*) n,
                 (array_agg(coalesce(nullif(f.error_message, ''), f.summary, 'no detail') order by f.started_at desc))[1] msg,
                 exists (select 1 from public.pipeline_runs o where o.job_name = f.job_name and o.status in ('success', 'warning')
                            and o.started_at > max(f.started_at) and o.started_at < v_to) later_ok
            from public.pipeline_runs f
           where f.started_at >= v_from and f.started_at < v_to and f.status = 'failed'
           group by f.job_name order by 4, 1 limit 5) x;
  -- Jobs whose latest run today failed (a failure followed by a good run is not "still failing").
  select count(*) into r_failing
    from (select distinct on (job_name) status from public.pipeline_runs
           where started_at >= v_from and started_at < v_to and status in ('success', 'warning', 'failed')
           order by job_name, started_at desc) x
   where status = 'failed';
  v_lines := array[format('%s runs: %s OK, %s warnings, %s failed%s.', r_total, r_ok, r_warn, r_fail,
                          case when r_running > 0 then format(', %s still running', r_running) else '' end)];
  if v_fail_list is not null then v_lines := v_lines || ('Failed: ' || v_fail_list); end if;
  select started_at, status, coalesce(substring(summary from '^\d+ integrity checks: \d+ failed, \d+ warnings?'), left(summary, 80)) s
    into v_integrity
    from public.pipeline_runs where job_name = 'model_integrity_checks' and started_at >= v_from and started_at < v_to
   order by started_at desc limit 1;
  if v_integrity.started_at is not null then
    v_lines := v_lines || format('Integrity checks (%s): %s; %s.', to_char(v_integrity.started_at at time zone 'Europe/London', hm),
                                 case v_integrity.status when 'success' then 'passed' when 'warning' then 'passed with warnings' else v_integrity.status end,
                                 v_integrity.s);
  end if;
  select pages_tested, pages_failed, pages_warned, mode, started_at into v_smoke
    from public.smoke_runs where kind = 'production' and started_at >= v_from and started_at < v_to
   order by started_at desc limit 1;
  select count(*), coalesce(sum(pages_failed), 0) into v_prev_n, v_prev_fail
    from public.smoke_runs where kind = 'preview' and started_at >= v_from and started_at < v_to;
  if v_smoke.started_at is not null or v_prev_n > 0 then
    v_lines := v_lines || (concat_ws('; ',
      case when v_smoke.started_at is not null then
        format('Smoke test of the live site (%s): %s pages, %s failed, %s over budget', v_smoke.mode, v_smoke.pages_tested, v_smoke.pages_failed, v_smoke.pages_warned) end,
      case when v_prev_n > 0 then format('%s preview smoke run%s, %s failed pages', v_prev_n, case when v_prev_n = 1 then '' else 's' end, v_prev_fail) end) || '.');
  end if;
  v_sections := v_sections || jsonb_build_object('key', 'pipelines', 'title', 'Data and pipelines',
    'link', 'https://fixtureshark.com/data-health', 'lines', to_jsonb(v_lines));
  v_headline := v_headline || case when r_fail = 0 then 'no failed runs'
                                    else format('%s (%s still failing)', private.digest_n(r_fail, 'failed run'), r_failing) end;

  -- ============================================================ football
  select count(*) into f_results from public.matches where created_at >= v_from and created_at < v_to;
  select string_agg(format('%s %s', name, n), ', ' order by n desc, name) into f_by_league
    from (select l.name, count(*) n from public.matches m join public.leagues l on l.league_id = m.league_id
           where m.created_at >= v_from and m.created_at < v_to group by 1 order by 2 desc, 1 limit 6) x;
  select count(*), string_agg(format('%s v %s: %s → %s', home_team_name, away_team_name,
                                     to_char(was_date, 'Dy FMDD Mon') || coalesce(' ' || to_char(was_time, 'HH24:MI'), ''),
                                     to_char(now_date, 'Dy FMDD Mon') || coalesce(' ' || to_char(now_time, 'HH24:MI'), '')
                                     || case when status = 'postponed' then ' (postponed)' else '' end), E'\n' order by changed_at)
    into f_moved, f_moved_list
    from (select * from public.fixture_changes_net where changed_at >= v_from and changed_at < v_to order by changed_at limit 5) x;
  select count(*) into f_moved from public.fixture_changes_net where changed_at >= v_from and changed_at < v_to;
  select count(*), sum(starters), sum(model_matched) into l_teams, l_starters, l_matched
    from public.social_lineup_checks where kickoff_time >= v_from and kickoff_time < v_to;
  if f_results + f_moved + l_teams > 0 then
    v_lines := '{}';
    if f_results > 0 then v_lines := v_lines || format('%s added: %s.', private.digest_n(f_results, 'result'), f_by_league); end if;
    if f_moved > 0 then v_lines := v_lines || (private.digest_n(f_moved, 'fixture') || ' moved:' || E'\n' || f_moved_list); end if;
    if l_teams > 0 then
      v_lines := v_lines || format('Line-ups: %s teams; our model had %s of %s starters right (%s%%): https://fixtureshark.com/admin/team-sheets',
                                   l_teams, l_matched, l_starters, round(100.0 * l_matched / nullif(l_starters, 0)));
    end if;
    v_sections := v_sections || jsonb_build_object('key', 'football', 'title', 'Football',
      'link', case when f_moved > 0 then 'https://fixtureshark.com/fixtures/changes' else 'https://fixtureshark.com/admin/team-sheets' end,
      'lines', to_jsonb(v_lines));
    if f_results > 0 then v_headline := v_headline || (private.digest_n(f_results, 'result') || ' in'); end if;
  end if;

  -- ============================================================ FPL
  with ch as (
    select p.web_name, ft.short_name, n.price_before, n.price_after, n.ownership
      from public.fpl_price_predictor_nights n
      join public.fpl_players p on p.season_id = n.season_id and p.fpl_player_id = n.fpl_player_id
      left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
     where n.season_id = v_season and n.recorded_at >= v_from and n.recorded_at < v_to and n.price_after <> n.price_before)
  select (select count(*) from ch where price_after > price_before),
         (select count(*) from ch where price_after < price_before),
         (select string_agg(format('%s (%s) £%sm, %s%%', web_name, short_name, round(price_after / 10.0, 1), round(ownership, 1)), '; ' order by ownership desc nulls last)
            from (select * from ch where price_after > price_before order by ownership desc nulls last limit 5) u),
         (select string_agg(format('%s (%s) £%sm, %s%%', web_name, short_name, round(price_after / 10.0, 1), round(ownership, 1)), '; ' order by ownership desc nulls last)
            from (select * from ch where price_after < price_before order by ownership desc nulls last limit 5) d)
    into v_up, v_down, v_up_list, v_down_list;
  select fpl_event_id, deadline_time into g_next from public.fpl_gameweeks
   where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  select fpl_event_id, deadline_time into g_passed from public.fpl_gameweeks
   where season_id = v_season and deadline_time >= v_from and deadline_time < v_to order by deadline_time desc limit 1;
  select fpl_event_id, finished into g_current from public.fpl_gameweeks where season_id = v_season and is_current limit 1;
  if v_up + v_down > 0 or g_next.fpl_event_id is not null or g_passed.fpl_event_id is not null then
    v_lines := '{}';
    if v_up > 0 then v_lines := v_lines || format('Risers (%s): %s.', v_up, v_up_list); end if;
    if v_down > 0 then v_lines := v_lines || format('Fallers (%s): %s.', v_down, v_down_list); end if;
    if v_up + v_down = 0 then v_lines := v_lines || 'No price changes overnight.'::text; end if;
    if g_passed.fpl_event_id is not null then
      v_lines := v_lines || format('GW%s deadline passed at %s.', g_passed.fpl_event_id, to_char(g_passed.deadline_time at time zone 'Europe/London', hm));
    elsif g_current.fpl_event_id is not null and not coalesce(g_current.finished, false) then
      v_lines := v_lines || format('GW%s in progress.', g_current.fpl_event_id);
    end if;
    if g_next.fpl_event_id is not null then
      v_lines := v_lines || format('Next: GW%s deadline %s (UK).', g_next.fpl_event_id,
                                   to_char(g_next.deadline_time at time zone 'Europe/London', 'Dy FMDD Mon HH24:MI'));
    end if;
    v_sections := v_sections || jsonb_build_object('key', 'fpl', 'title', 'FPL',
      'link', 'https://fixtureshark.com/fpl/price-risk', 'lines', to_jsonb(v_lines));
  end if;

  -- ============================================================ changes shipped
  select count(*), string_agg(regexp_replace(filename, '\.sql$', ''), E'\n' order by applied_at)
    into m_count, m_list
    from (select filename, applied_at from public.repo_migrations where applied_at >= v_from and applied_at < v_to order by applied_at limit 8) x;
  select count(*) into m_count from public.repo_migrations where applied_at >= v_from and applied_at < v_to;
  if m_count > 0 then
    v_sections := v_sections || jsonb_build_object('key', 'shipped', 'title', 'Changes shipped',
      'link', 'https://github.com/sharkey1982/football-data-webapp/pulls?q=is%3Apr+is%3Amerged',
      'lines', to_jsonb(array[private.digest_n(m_count, 'database migration') || ' applied:' || E'\n' || m_list]));
  end if;

  return jsonb_build_object(
    'day', p_day,
    'from', v_from,
    'to', v_to,
    'subject', 'FixtureShark today: ' || to_char(p_day, 'Dy FMDD Mon'),
    'headline', array_to_string(v_headline, ' · ') || '.',
    'sections', v_sections);
end;
$$;
revoke all on function private.admin_daily_digest(date) from public, anon, authenticated;

-- ================================================================ first runs
-- Cloudflare: everything Cloudflare still holds. X: today's daily read
-- (~19 posts, ~$0.02).
select private.cf_import_call('backfill');
select private.social_metrics_call('daily');

-- A "[Preview]" of today's digest (does not count as the day's send), once
-- both runs above have reported or after 15 minutes; then the job removes
-- itself.
create or replace function private.admin_digest_preview_once(p_since timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ((exists (select 1 from cf.import_runs where started_at >= p_since - interval '1 minute')
           and exists (select 1 from public.social_metrics_runs where started_at >= p_since - interval '1 minute' and finished_at is not null))
          or now() >= p_since + interval '15 minutes') then
    return jsonb_build_object('status', 'waiting');
  end if;
  perform cron.unschedule('admin-digest-preview-once');
  return private.admin_digest_send((now() at time zone 'Europe/London')::date, 'preview');
end;
$$;
revoke all on function private.admin_digest_preview_once(timestamptz) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'admin-digest-preview-once') then
    perform cron.schedule('admin-digest-preview-once', '* * * * *', format('select private.admin_digest_preview_once(%L)', now()));
  end if;
end $$;
