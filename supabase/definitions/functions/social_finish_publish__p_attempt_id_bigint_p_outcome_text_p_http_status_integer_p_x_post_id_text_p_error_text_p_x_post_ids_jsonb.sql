-- Live definition exported from the database (function social_finish_publish(p_attempt_id bigint, p_outcome text, p_http_status integer, p_x_post_id text, p_error text, p_x_post_ids jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_finish_publish(p_attempt_id bigint, p_outcome text, p_http_status integer, p_x_post_id text, p_error text, p_x_post_ids jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.social_publish_attempts;
begin
  if p_outcome not in ('posted', 'failed', 'unknown') then raise exception 'bad outcome %', p_outcome; end if;
  select * into a from public.social_publish_attempts where attempt_id = p_attempt_id for update;
  if a.attempt_id is null or a.mode <> 'live' or a.outcome is not null then raise exception 'attempt % is not an open live attempt', p_attempt_id; end if;
  update public.social_publish_attempts set outcome = p_outcome, http_status = p_http_status, x_post_id = p_x_post_id,
         error = left(p_error, 2000), finished_at = now(),
         estimated_cost_usd = case when p_outcome = 'failed' then 0 else estimated_cost_usd end
   where attempt_id = p_attempt_id;
  update public.social_post_candidates set
         publication_status = case p_outcome when 'posted' then 'published' when 'failed' then 'failed' else 'needs_check' end,
         x_post_id = case when p_outcome in ('posted', 'unknown') then coalesce(p_x_post_id, x_post_id) else x_post_id end,
         x_post_ids = coalesce(p_x_post_ids, x_post_ids),
         published_at = case when p_outcome = 'posted' then now() else published_at end,
         last_error = case when p_outcome = 'posted' and p_error is null then null else left(p_error, 2000) end, updated_at = now()
   where candidate_id = a.candidate_id;
  perform private.social_audit('publish_' || p_outcome, a.candidate_id, a.requested_by,
                               jsonb_strip_nulls(jsonb_build_object('attempt_id', p_attempt_id, 'http_status', p_http_status,
                                                                    'x_post_id', p_x_post_id, 'x_post_ids', p_x_post_ids, 'error', left(p_error, 500))));
  if a.requested_by is null and (p_outcome <> 'posted' or p_error is not null) then
    perform private.social_trip_breaker(format('automatic post #%s: %s', a.candidate_id, coalesce(p_error, p_outcome)), a.candidate_id);
  end if;
end;
$function$
;
