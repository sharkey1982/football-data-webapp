-- ============================================================================
-- X post engagement (Chris, 25 Oct 2026: measure which post types land, so
-- the ones that don't can be dropped; every post should tell readers
-- something new).
--
--   * x-metrics Edge Function, weekly (Monday 07:40 UTC, pg_cron) and on
--     demand from /admin/social: reads the metrics of every post published in
--     the last 30 days (every post of a thread) with GET /2/tweets, 100 ids a
--     call, at most 300 posts a run (~$0.001 each). Organic metrics
--     (impressions, link and profile clicks) where X returns them for our own
--     posts, public metrics otherwise.
--   * social_post_metrics: one row per post per read. social_metrics_runs: one
--     row per run, with its estimated cost.
--   * social_metrics_report(): per post type, the latest read of posts at
--     least 24 hours old (a fresher one is still collecting views), plus the
--     top and bottom five posts by engagement rate. Admin only.
-- ============================================================================

create table if not exists public.social_metrics_runs (
  run_id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by text not null default 'schedule',
  posts_requested integer not null default 0,
  posts_read integer not null default 0,
  posts_missing integer not null default 0,
  fields text,
  estimated_cost_usd numeric(8, 4) not null default 0,
  error text
);

create table if not exists public.social_post_metrics (
  metric_id bigint generated always as identity primary key,
  run_id bigint not null references public.social_metrics_runs (run_id),
  candidate_id bigint not null references public.social_post_candidates (candidate_id),
  x_post_id text not null,
  position integer not null default 1,          -- 1 = the first post of a thread
  captured_at timestamptz not null default now(),
  impressions integer,
  likes integer,
  replies integer,
  reposts integer,
  quotes integer,
  bookmarks integer,
  url_clicks integer,
  profile_clicks integer,
  metrics jsonb not null default '{}'
);
create index if not exists social_post_metrics_post_idx on public.social_post_metrics (x_post_id, captured_at desc);
create index if not exists social_post_metrics_candidate_idx on public.social_post_metrics (candidate_id);

do $$
declare t text;
begin
  foreach t in array array['social_metrics_runs', 'social_post_metrics'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_read', t);
  end loop;
end $$;

-- Per post type, from the latest read of each post at least 24 hours old.
-- A thread counts once: impressions of its first post, engagements summed
-- over all its posts (likes, replies, reposts, quotes, bookmarks, link clicks).
create or replace function public.social_metrics_report()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  with latest as (
    select distinct on (m.x_post_id) m.*
      from public.social_post_metrics m
     order by m.x_post_id, m.captured_at desc),
  per_post as (
    select c.candidate_id, c.post_type, c.published_at, left(c.text, 140) as text,
           c.x_post_id, max(l.captured_at) as captured_at,
           max(l.impressions) filter (where l.position = 1) as impressions,
           sum(coalesce(l.likes, 0) + coalesce(l.replies, 0) + coalesce(l.reposts, 0) + coalesce(l.quotes, 0)
               + coalesce(l.bookmarks, 0) + coalesce(l.url_clicks, 0)) as engagements,
           sum(l.likes) as likes, sum(l.replies) as replies, sum(l.reposts) as reposts, sum(l.url_clicks) as url_clicks
      from latest l join public.social_post_candidates c on c.candidate_id = l.candidate_id
     group by c.candidate_id, c.post_type, c.published_at, c.text, c.x_post_id),
  settled as (
    select p.*, case when p.impressions > 0 then p.engagements::numeric / p.impressions end as rate
      from per_post p where p.captured_at >= p.published_at + interval '24 hours'),
  by_type as (
    select post_type, count(*) as posts,
           percentile_cont(0.5) within group (order by impressions) as median_impressions,
           percentile_cont(0.5) within group (order by engagements) as median_engagements,
           case when sum(impressions) > 0 then sum(engagements)::numeric / sum(impressions) end as engagement_rate,
           sum(likes) as likes, sum(replies) as replies, sum(reposts) as reposts, sum(url_clicks) as url_clicks
      from settled group by post_type)
  select jsonb_build_object(
    'types', coalesce((select jsonb_agg(to_jsonb(b) order by b.engagement_rate desc nulls last) from by_type b), '[]'),
    'top', coalesce((select jsonb_agg(to_jsonb(s) order by s.rate desc nulls last)
                       from (select * from settled where impressions >= 20 order by rate desc nulls last limit 5) s), '[]'),
    'bottom', coalesce((select jsonb_agg(to_jsonb(s) order by s.rate asc nulls last)
                          from (select * from settled where impressions >= 20 order by rate asc nulls last limit 5) s), '[]'),
    'settled_posts', (select count(*) from settled),
    'fresh_posts', (select count(*) from per_post) - (select count(*) from settled),
    'last_run', (select to_jsonb(r) from public.social_metrics_runs r order by r.run_id desc limit 1))
    into v;
  return v;
end;
$$;
revoke all on function public.social_metrics_report() from public, anon;
grant execute on function public.social_metrics_report() to authenticated;

-- Weekly call to the x-metrics Edge Function with the worker token.
create or replace function private.social_metrics_call()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-metrics',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := jsonb_build_object('triggered_by', 'schedule'), timeout_milliseconds := 60000);
end;
$$;

select cron.unschedule('social-x-metrics') where exists (select 1 from cron.job where jobname = 'social-x-metrics');
select cron.schedule('social-x-metrics', '40 7 * * 1', $$select private.social_metrics_call()$$);
