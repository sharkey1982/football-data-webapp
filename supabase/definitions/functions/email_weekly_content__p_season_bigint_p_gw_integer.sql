-- Live definition exported from the database (function email_weekly_content(p_season bigint, p_gw integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_weekly_content(p_season bigint, p_gw integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_deadline timestamptz; v_prev jsonb; v_market jsonb;
begin
  select deadline_time into v_deadline from public.fpl_gameweeks where season_id = p_season and fpl_event_id = p_gw;

  -- The gameweek preview, if published.
  select jsonb_build_object('title', r.title, 'path', format('/fpl/gameweek/%s/%s/preview', r.season_label, r.fpl_event_id),
                            'published_at', r.published_at)
    into v_prev
    from public.fpl_gameweek_reports r
   where r.season_id = p_season and r.fpl_event_id = p_gw and r.kind = 'preview' and r.status = 'published'
   order by r.version desc, r.published_at desc limit 1;

  -- Where our model and the market disagree: the daily_market post's logic
  -- (social_daily_games; rated teams only; biggest gap on any outcome, 5+
  -- points) over the games from today to three days after the deadline.
  with g as (
    select g.*, d::date as day
      from generate_series(v_today, coalesce((v_deadline at time zone 'Europe/London')::date, v_today) + 3, interval '1 day') d
      cross join lateral private.social_daily_games(d::date) g
     where g.status = 'scheduled' and not g.estimated
       and d::date + coalesce(g.kickoff_time, time '12:00') > now() at time zone 'Europe/London'),
  o as (
    select g.*, x.outcome, abs(x.pm - x.mm) gap,
           row_number() over (partition by g.fixture_id order by abs(x.pm - x.mm) desc, x.outcome) rn
      from g cross join lateral (values ('home', g.ph, g.mh), ('draw', g.pd, g.md), ('away', g.pa, g.ma)) x(outcome, pm, mm))
  select coalesce(jsonb_agg(jsonb_build_object('home', o.home, 'away', o.away, 'league', o.lg, 'day', o.day,
                                               'kickoff', to_char(o.kickoff_time, 'HH24:MI'), 'slug', f.slug,
                                               'outcome', o.outcome, 'gap', round(o.gap, 3),
                                               'market', jsonb_build_array(o.mh, o.md, o.ma), 'model', jsonb_build_array(o.ph, o.pd, o.pa))
                            order by o.gap desc, o.fixture_id), '[]')
    into v_market
    from (select * from o where rn = 1 and gap >= 0.05 order by gap desc, fixture_id limit 5) o
    left join public.fixtures f on f.fixture_id = o.fixture_id;

  return jsonb_build_object(
    'season_id', p_season, 'gw', p_gw, 'deadline', v_deadline, 'generated_at', now(),
    'sections', private.email_sections(p_season, p_gw, null, null),
    'preview', v_prev,
    'market', v_market);
end;
$function$
;
