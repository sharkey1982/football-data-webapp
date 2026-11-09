-- Live definition exported from the database (function email_quota_take(p_n integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_quota_take(p_n integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare st private.email_settings; v_day integer; v_month integer; v_ok integer; v_today date := (now() at time zone 'UTC')::date;
begin
  select * into st from private.email_settings where id;
  if not st.sending_enabled then return 0; end if;
  insert into private.email_outbound_days (day, sent) values (v_today, 0) on conflict (day) do nothing;
  select sent into v_day from private.email_outbound_days where day = v_today for update;
  select coalesce(sum(sent), 0) into v_month from private.email_outbound_days where day >= date_trunc('month', v_today)::date;
  v_ok := greatest(0, least(p_n, st.daily_limit - v_day, st.monthly_limit - v_month));
  update private.email_outbound_days set sent = sent + v_ok where day = v_today;
  return v_ok;
end;
$function$
;
