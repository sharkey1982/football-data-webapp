-- Live definition exported from the database (function social_reply_budget(p_kind text, p_estimate numeric)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_reply_budget(p_kind text, p_estimate numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  s public.social_settings;
  v_m0 timestamptz := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_day int := extract(day from now() at time zone 'Europe/London');
  v_days int := extract(day from (date_trunc('month', now() at time zone 'Europe/London') + interval '1 month - 1 day'));
  v_reply numeric; v_metrics numeric; v_posts numeric; v_total numeric; v_allow numeric; r jsonb := '[]';
begin
  select * into s from public.social_settings where id;
  select coalesce(sum(estimated_cost_usd), 0) into v_reply from public.social_reply_runs where started_at >= v_m0;
  select coalesce(sum(estimated_cost_usd), 0) into v_metrics from public.social_metrics_runs where started_at >= v_m0;
  select coalesce(sum(estimated_cost_usd), 0) into v_posts from public.social_publish_attempts
   where mode = 'live' and (outcome is null or outcome in ('posted', 'unknown')) and started_at >= v_m0;
  v_total := v_reply + v_metrics + v_posts;
  v_allow := case when p_kind = 'ideas' then (s.reply_reads_budget_usd - 0.06) * least(1, (v_day + 1)::numeric / v_days)
                  else s.reply_reads_budget_usd end;
  if p_kind = 'ideas' and not s.reply_ideas_enabled then r := r || to_jsonb('reply ideas are switched off'::text); end if;
  if p_kind = 'mentions' and not s.mentions_enabled then r := r || to_jsonb('mention reading is switched off'::text); end if;
  if v_reply + p_estimate > v_allow then
    r := r || to_jsonb(format('reply reads: $%s this month + $%s would pass $%s%s', round(v_reply, 3), round(p_estimate, 3), round(v_allow, 3),
                              case when p_kind = 'ideas' and v_allow < s.reply_reads_budget_usd - 0.06 then ' (pace for the month so far)' else '' end));
  end if;
  if v_total + p_estimate > s.monthly_budget_usd then
    r := r || to_jsonb(format('X budget: $%s this month + $%s would pass $%s', round(v_total, 3), round(p_estimate, 3), s.monthly_budget_usd));
  end if;
  return jsonb_build_object('ok', jsonb_array_length(r) = 0, 'reasons', r, 'reply_mtd', round(v_reply, 4), 'metrics_mtd', round(v_metrics, 4),
                            'posts_mtd', round(v_posts, 4), 'total_mtd', round(v_total, 4), 'allowance', round(v_allow, 4),
                            'cap', s.reply_reads_budget_usd, 'budget', s.monthly_budget_usd);
end;
$function$
;
