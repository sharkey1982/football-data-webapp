-- Live definition exported from the database (function social_claim_for_publish(p_candidate_id bigint, p_mode text, p_actor uuid)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_claim_for_publish(p_candidate_id bigint, p_mode text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  s public.social_settings; x public.social_x_connection; c public.social_post_candidates;
  r jsonb := '[]'; v_url boolean; v_cost numeric; v_attempt bigint; v_posts text[];
begin
  if p_mode not in ('dry_run', 'live') then raise exception 'mode must be dry_run or live'; end if;
  select * into s from public.social_settings for update;   -- one publisher at a time
  select * into x from public.social_x_connection;
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id for update;
  if c.candidate_id is null then return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('candidate not found')); end if;
  v_posts := private.social_posts(c);

  r := private.social_revalidate(p_candidate_id);
  if c.approval_status <> 'approved' then r := r || to_jsonb(format('not approved (%s)', c.approval_status)); end if;
  if c.publication_status not in ('unpublished', 'failed') then r := r || to_jsonb(format('already %s', c.publication_status)); end if;
  if c.publish_attempts >= s.max_live_attempts then r := r || to_jsonb(format('%s live attempts already made', c.publish_attempts)); end if;
  if p_actor is null then
    if c.held then r := r || to_jsonb('on hold'::text); end if;
    if not c.auto then r := r || to_jsonb('not queued for automatic posting'::text); end if;
    if not s.auto_publish_enabled then r := r || to_jsonb('automatic publishing is off'::text); end if;
    if s.breaker_tripped_at is not null then r := r || to_jsonb(format('circuit breaker tripped: %s', s.breaker_reason)); end if;
  end if;
  if exists (select 1 from public.social_post_candidates o where o.candidate_id <> c.candidate_id
               and o.publication_status in ('publishing', 'published', 'needs_check')
               and md5(lower(regexp_replace(btrim(o.text), '\s+', ' ', 'g'))) = md5(lower(regexp_replace(btrim(c.text), '\s+', ' ', 'g')))) then
    r := r || to_jsonb('the same text has already been posted'::text);
  end if;
  v_url := exists (select 1 from unnest(v_posts) p where public.social_has_url(p));
  v_cost := private.social_cost(c);

  if p_mode = 'live' then
    if s.kill_switch then r := r || to_jsonb('kill switch is on'::text); end if;
    if not s.live_enabled then r := r || to_jsonb('live publishing is not enabled'::text); end if;
    if x.status <> 'connected' then r := r || to_jsonb(format('X account not connected (%s)', x.status)); end if;
    if lower(coalesce(x.x_username, '')) <> lower(s.allowed_x_username)
       or (s.allowed_x_user_id is not null and x.x_user_id is distinct from s.allowed_x_user_id) then
      r := r || to_jsonb(format('connected account is not @%s', s.allowed_x_username));
    end if;
  end if;
  r := r || private.social_limit_reasons(v_cost, v_url);

  insert into public.social_publish_attempts (candidate_id, mode, requested_by, request_text, has_url, estimated_cost_usd, outcome,
                                              blocked_reasons, finished_at, posts)
  values (p_candidate_id, p_mode, p_actor, c.text, v_url, case when p_mode = 'live' then v_cost else 0 end,
          case when jsonb_array_length(r) > 0 then 'blocked' when p_mode = 'dry_run' then 'dry_run_ok' end,
          r, case when jsonb_array_length(r) > 0 or p_mode = 'dry_run' then now() end, coalesce(array_length(v_posts, 1), 1))
  returning attempt_id into v_attempt;
  perform private.social_audit(case when p_mode = 'live' then 'publish_requested' else 'dry_run' end, p_candidate_id, p_actor,
                               jsonb_build_object('attempt_id', v_attempt, 'blocked', r, 'automatic', p_actor is null));

  if jsonb_array_length(r) > 0 then
    return jsonb_build_object('ok', false, 'attempt_id', v_attempt, 'reasons', r, 'text', c.text, 'thread', to_jsonb(v_posts), 'estimated_cost_usd', v_cost);
  end if;
  if p_mode = 'live' then
    update public.social_post_candidates set publication_status = 'publishing', publish_attempts = publish_attempts + 1, updated_at = now()
     where candidate_id = p_candidate_id;
  end if;
  return jsonb_build_object('ok', true, 'attempt_id', v_attempt, 'mode', p_mode, 'text', c.text, 'thread', to_jsonb(v_posts),
                            'estimated_cost_usd', v_cost);
end;
$function$
;
