-- Live definition exported from the database (view fpl_gameweek_reports_latest).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_gameweek_reports_latest with (security_invoker=true) as
 SELECT DISTINCT ON (season_id, fpl_event_id, kind) report_id,
    season_id,
    season_label,
    fpl_event_id,
    kind,
    version,
    frozen,
    generated_at,
    published_at,
    title,
    summary,
    payload,
    reddit_md,
    x_thread
   FROM fpl_gameweek_reports
  WHERE (status = 'published'::text)
  ORDER BY season_id, fpl_event_id, kind, version DESC;
