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
                 'min_minutes_between_posts', 'monthly_budget_usd', 'allow_urls', 'auto_publish_enabled') then
      raise exception 'setting % cannot be changed here', k;
    end if;
  end loop;
  if coalesce((p->>'auto_publish_enabled')::boolean, false) then
    raise exception 'automatic publishing is not available yet (Phase 4 needs its own reviewed change)';
  end if;
  select to_jsonb(s) into v_before from public.social_settings s;
  update public.social_settings set
    kill_switch = coalesce((p->>'kill_switch')::boolean, kill_switch),
    live_enabled = coalesce((p->>'live_enabled')::boolean, live_enabled),
    detector_enabled = coalesce((p->>'detector_enabled')::boolean, detector_enabled),
    max_posts_per_day = coalesce((p->>'max_posts_per_day')::int, max_posts_per_day),
    max_posts_per_month = coalesce((p->>'max_posts_per_month')::int, max_posts_per_month),
    min_minutes_between_posts = coalesce((p->>'min_minutes_between_posts')::int, min_minutes_between_posts),
    monthly_budget_usd = coalesce((p->>'monthly_budget_usd')::numeric, monthly_budget_usd),
    allow_urls = coalesce((p->>'allow_urls')::boolean, allow_urls),
    updated_at = now(), updated_by = auth.uid()
  where id;
  perform private.social_audit('settings', null, auth.uid(), jsonb_build_object('before', v_before, 'change', p));
  return jsonb_build_object('ok', true);
end;
$function$
;
