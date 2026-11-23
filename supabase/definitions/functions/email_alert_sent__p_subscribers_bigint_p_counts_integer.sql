-- Live definition exported from the database (function email_alert_sent(p_subscribers bigint[], p_counts integer[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_alert_sent(p_subscribers bigint[], p_counts integer[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into private.email_alert_log (subscriber_id, changes)
  select s, c from unnest(p_subscribers, p_counts) as u(s, c) where s is not null;
$function$
;
