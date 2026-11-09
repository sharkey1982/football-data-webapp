-- Live definition exported from the database (function get_email_admin()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_email_admin()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_today date := (now() at time zone 'UTC')::date; st private.email_settings;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into st from private.email_settings where id;
  return jsonb_build_object(
    'counts', (select jsonb_build_object(
                 'pending', count(*) filter (where status = 'pending'),
                 'confirmed', count(*) filter (where status = 'confirmed'),
                 'unsubscribed', count(*) filter (where status = 'unsubscribed'),
                 'football', count(*) filter (where status = 'confirmed' and 'football_market' = any (topics)),
                 'confirmed_7d', count(*) filter (where status = 'confirmed' and confirmed_at > now() - interval '7 days'),
                 'unsubscribed_7d', count(*) filter (where unsubscribed_at > now() - interval '7 days'))
               from private.email_subscribers),
    'signups_24h', (select jsonb_object_agg(outcome, n) from (select outcome, count(*) n from private.email_signup_attempts
                     where created_at > now() - interval '24 hours' group by outcome) x),
    'quota', jsonb_build_object('today', coalesce((select sent from private.email_outbound_days where day = v_today), 0),
                                'month', (select coalesce(sum(sent), 0) from private.email_outbound_days where day >= date_trunc('month', v_today)::date),
                                'daily_limit', st.daily_limit, 'monthly_limit', st.monthly_limit, 'sending_enabled', st.sending_enabled),
    'next', public.email_weekly_issue(),
    'admin_address_set', private.email_admin_address() is not null,
    'sends', (select coalesce(jsonb_agg(to_jsonb(s) order by s.started_at desc), '[]') from (
               select send_id, kind, fpl_event_id, subject, status, attempts, recipients, football, sent, failed, note, started_at, finished_at
                 from private.email_sends order by started_at desc limit 12) s),
    'failures', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]') from (
                  select failure_id, send_id, kind, http_status, error, recipients, created_at
                    from private.email_failures order by created_at desc limit 12) f));
end;
$function$
;
