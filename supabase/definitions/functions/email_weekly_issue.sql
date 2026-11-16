-- Live definition exported from the database (function email_weekly_issue()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_weekly_issue()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select jsonb_build_object('season_id', g.season_id, 'gw', g.fpl_event_id, 'deadline', g.deadline_time,
                              'due_at', private.email_weekly_due_at(g.deadline_time),
                              'due', now() >= private.email_weekly_due_at(g.deadline_time) and now() < g.deadline_time - interval '2 hours',
                              'issue_key', format('fpl-weekly:%s:%s', g.season_id, g.fpl_event_id),
                              'sent', (select to_jsonb(x) from (select send_id, status, sent, failed, started_at from private.email_sends
                                                                  where issue_key = format('fpl-weekly:%s:%s', g.season_id, g.fpl_event_id)) x))
      from public.fpl_gameweeks g
     where g.season_id = public.fpl_current_season_id() and g.deadline_time > now()
     order by g.deadline_time limit 1), '{}'::jsonb);
$function$
;
