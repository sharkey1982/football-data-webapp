-- Live definition exported from the database (function get_email_alerts_admin()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_email_alerts_admin()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'subscribers_with_alerts', (select count(*) from private.email_subscribers where status = 'confirmed' and 'alerts' = any (topics)),
    'changes_24h', (select count(*) from private.fpl_status_changes where seen_at > now() - interval '24 hours'),
    'alert_emails_24h', (select count(*) from private.email_alert_log where sent_at > now() - interval '24 hours'),
    'last_read', (select max(read_at) from private.fpl_status_state));
end;
$function$
;
