-- Live definition exported from the database (function social_auto_tick()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_auto_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  s public.social_settings; c public.social_post_candidates; v_errors jsonb; v_limits jsonb; v_hour integer;
  v_queued integer; v_notified integer := 0; v_url boolean;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only'; end if;
  select * into s from public.social_settings;
  if not s.auto_publish_enabled then return jsonb_build_object('status', 'off'); end if;
  v_queued := private.social_auto_queue();

  -- A post stuck 'publishing' for 15 minutes: the worker died mid-post.
  for c in select * from public.social_post_candidates where publication_status = 'publishing' and updated_at < now() - interval '15 minutes' loop
    update public.social_post_candidates set publication_status = 'needs_check', last_error = 'stuck publishing for 15 minutes', updated_at = now()
     where candidate_id = c.candidate_id;
    update public.social_publish_attempts set outcome = 'unknown', finished_at = now(), error = 'stuck publishing'
     where candidate_id = c.candidate_id and mode = 'live' and outcome is null;
    perform private.social_trip_breaker(format('post #%s stuck publishing', c.candidate_id), c.candidate_id);
  end loop;

  -- Emails: when a queued post's hold starts.
  for c in select * from public.social_post_candidates
            where auto and approval_status = 'approved' and publication_status = 'unpublished' and not held and notified_at is null
              and hold_until - make_interval(mins => s.hold_minutes) <= now() and expires_at > now()
  loop
    update public.social_post_candidates set notified_at = now() where candidate_id = c.candidate_id;
    perform private.social_notify(jsonb_build_object('kind', 'queued', 'candidate_id', c.candidate_id));
    v_notified := v_notified + 1;
  end loop;

  if s.kill_switch or not s.live_enabled or s.breaker_tripped_at is not null then
    return jsonb_build_object('status', 'paused', 'queued', v_queued, 'notified', v_notified,
                              'reason', case when s.breaker_tripped_at is not null then 'circuit breaker' when s.kill_switch then 'kill switch' else 'live off' end);
  end if;
  v_hour := extract(hour from now() at time zone 'Europe/London');
  if v_hour < s.post_hours_from or v_hour >= s.post_hours_to then
    return jsonb_build_object('status', 'outside posting hours', 'queued', v_queued, 'notified', v_notified);
  end if;
  if exists (select 1 from public.social_post_candidates where publication_status = 'publishing') then
    return jsonb_build_object('status', 'a post is in flight', 'queued', v_queued, 'notified', v_notified);
  end if;

  for c in select * from public.social_post_candidates
            where auto and approval_status = 'approved' and publication_status in ('unpublished') and validation_status = 'passed' and not held
              and hold_until <= now() and expires_at > now() and notified_at is not null
            order by hold_until
  loop
    v_errors := private.social_revalidate(c.candidate_id);
    if jsonb_array_length(v_errors) > 0 then
      -- No longer true: a newer candidate will replace it. Not a fault.
      update public.social_post_candidates set approval_status = 'superseded', validation_status = 'stale', validation_errors = v_errors,
             validated_at = now(), updated_at = now()
       where candidate_id = c.candidate_id;
      perform private.social_audit('auto_stale', c.candidate_id, null, jsonb_build_object('errors', v_errors));
      continue;
    end if;
    v_url := exists (select 1 from unnest(private.social_posts(c)) p where public.social_has_url(p));
    v_limits := private.social_limit_reasons(private.social_cost(c), v_url);
    if jsonb_array_length(v_limits) > 0 then
      return jsonb_build_object('status', 'waiting', 'candidate_id', c.candidate_id, 'reasons', v_limits, 'queued', v_queued, 'notified', v_notified);
    end if;
    perform net.http_post(
      url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-publish',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
      body := jsonb_build_object('candidate_id', c.candidate_id, 'mode', 'live'),
      timeout_milliseconds := 120000);
    perform private.social_audit('auto_publish_sent', c.candidate_id, null, '{}'::jsonb);
    return jsonb_build_object('status', 'sent', 'candidate_id', c.candidate_id, 'queued', v_queued, 'notified', v_notified);
  end loop;
  return jsonb_build_object('status', 'nothing due', 'queued', v_queued, 'notified', v_notified);
end;
$function$
;
