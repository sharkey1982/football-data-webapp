-- Live definition exported from the database (function social_metrics_report()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_metrics_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
