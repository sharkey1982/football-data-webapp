-- Live definition exported from the database (function social_update_settings(p jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_update_settings(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_before jsonb; k text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('kill_switch', 'live_enabled', 'detector_enabled', 'max_posts_per_day', 'max_posts_per_month',
                 'min_minutes_between_posts', 'monthly_budget_usd', 'allow_urls', 'auto_publish_enabled',
                 'hold_minutes', 'max_links_per_week', 'auto_post_types', 'reset_breaker') then
      raise exception 'setting % cannot be changed here', k;
    end if;
  end loop;
  select to_jsonb(s) into v_before from public.social_settings s;
  update public.social_settings set
    kill_switch = coalesce((p->>'kill_switch')::boolean, kill_switch),
    live_enabled = coalesce((p->>'live_enabled')::boolean, live_enabled),
    auto_publish_enabled = coalesce((p->>'auto_publish_enabled')::boolean, auto_publish_enabled),
    detector_enabled = coalesce((p->>'detector_enabled')::boolean, detector_enabled),
    max_posts_per_day = coalesce((p->>'max_posts_per_day')::int, max_posts_per_day),
    max_posts_per_month = coalesce((p->>'max_posts_per_month')::int, max_posts_per_month),
    min_minutes_between_posts = coalesce((p->>'min_minutes_between_posts')::int, min_minutes_between_posts),
    monthly_budget_usd = coalesce((p->>'monthly_budget_usd')::numeric, monthly_budget_usd),
    allow_urls = coalesce((p->>'allow_urls')::boolean, allow_urls),
    hold_minutes = coalesce((p->>'hold_minutes')::int, hold_minutes),
    max_links_per_week = coalesce((p->>'max_links_per_week')::int, max_links_per_week),
    auto_post_types = case when p ? 'auto_post_types' then array(select jsonb_array_elements_text(p->'auto_post_types')) else auto_post_types end,
    breaker_tripped_at = case when coalesce((p->>'reset_breaker')::boolean, false) then null else breaker_tripped_at end,
    breaker_reason = case when coalesce((p->>'reset_breaker')::boolean, false) then null else breaker_reason end,
    updated_at = now(), updated_by = auth.uid()
  where id;
  perform private.social_audit('settings', null, auth.uid(), jsonb_build_object('before', v_before, 'change', p));
  return jsonb_build_object('ok', true);
end;
$function$
;
