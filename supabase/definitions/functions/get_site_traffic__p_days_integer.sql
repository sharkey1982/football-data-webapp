-- Live definition exported from the database (function get_site_traffic(p_days integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_site_traffic(p_days integer DEFAULT 28)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
