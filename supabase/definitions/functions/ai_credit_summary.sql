-- Live definition exported from the database (function ai_credit_summary()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_credit_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  site_month numeric; ext_month numeric; lim numeric;
  chk_id bigint; chk_balance numeric; chk_at timestamptz;
  site_since numeric := 0; ext_since numeric := 0;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;

  -- Same month and limit as the spend guard in ai-lab-run (UTC calendar month).
  select coalesce(sum(cost_usd), 0) into site_month from public.ai_runs where created_at >= month_start;
  select coalesce(sum(cost_usd), 0) into ext_month from public.ai_external_spend where spent_at >= month_start;
  select coalesce((select (value #>> '{}')::numeric from public.ai_lab_settings where key = 'monthly_cost_limit_usd'), 20) into lim;

  select check_id, balance_usd, checked_at into chk_id, chk_balance, chk_at
  from public.ai_credit_checks order by checked_at desc, check_id desc limit 1;
  if chk_id is not null then
    select coalesce(sum(cost_usd), 0) into site_since from public.ai_runs where created_at >= chk_at;
    select coalesce(sum(cost_usd), 0) into ext_since from public.ai_external_spend where spent_at >= chk_at;
  end if;

  return jsonb_build_object(
    'month_site_usd', round(site_month, 4),
    'month_external_usd', round(ext_month, 4),
    'monthly_limit_usd', lim,
    'last_check', case when chk_id is null then null else jsonb_build_object(
      'balance_usd', chk_balance, 'checked_at', chk_at,
      'spent_since_usd', round(site_since + ext_since, 4),
      'estimate_left_usd', round(chk_balance - site_since - ext_since, 2)) end
  );
end $function$
;
