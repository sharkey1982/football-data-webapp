-- Live definition exported from the database (function social_review(p_candidate_id bigint, p_action text, p_text text, p_reason text, p_scheduled_for timestamp with time zone)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_review(p_candidate_id bigint, p_action text, p_text text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.social_post_candidates; v_errors jsonb; v_new text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id for update;
  if c.candidate_id is null then raise exception 'candidate % not found', p_candidate_id; end if;
  if c.publication_status in ('publishing', 'published', 'needs_check') then
    raise exception 'candidate % is %; it can no longer be changed', p_candidate_id, c.publication_status;
  end if;

  if p_action = 'approve' then
    v_errors := private.social_revalidate(p_candidate_id);
    if jsonb_array_length(v_errors) > 0 then
      update public.social_post_candidates set validation_status = 'stale', validation_errors = v_errors, validated_at = now(), updated_at = now()
       where candidate_id = p_candidate_id;
      perform private.social_audit('approve_refused', p_candidate_id, auth.uid(), jsonb_build_object('errors', v_errors));
      return jsonb_build_object('ok', false, 'errors', v_errors);
    end if;
    update public.social_post_candidates set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(),
           rejected_reason = null, updated_at = now() where candidate_id = p_candidate_id;

  elsif p_action = 'reject' then
    update public.social_post_candidates set approval_status = 'rejected', rejected_reason = p_reason, scheduled_for = null, updated_at = now()
     where candidate_id = p_candidate_id;

  elsif p_action = 'edit' then
    v_new := btrim(coalesce(p_text, ''));
    if v_new = '' then raise exception 'text is empty'; end if;
    if not (public.social_numbers(v_new) <@ public.social_numbers(c.generated_text)) then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array('an edit may reword but may not add numbers that are not in the generated text'));
    end if;
    if public.social_weighted_length(v_new) > 280 then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('too long: %s of 280', public.social_weighted_length(v_new))));
    end if;
    -- An edit needs a fresh approval.
    update public.social_post_candidates set text = v_new, approval_status = case when approval_status = 'approved' then 'pending' else approval_status end,
           approved_by = null, approved_at = null, updated_at = now() where candidate_id = p_candidate_id;
    perform private.social_audit('edit', p_candidate_id, auth.uid(), jsonb_build_object('from', c.text, 'to', v_new));
    return jsonb_build_object('ok', true);

  elsif p_action = 'schedule' then
    if c.approval_status <> 'approved' then raise exception 'approve before scheduling'; end if;
    if p_scheduled_for is null or p_scheduled_for >= c.expires_at then raise exception 'schedule time must be before the candidate expires (%)', c.expires_at; end if;
    update public.social_post_candidates set scheduled_for = p_scheduled_for, updated_at = now() where candidate_id = p_candidate_id;

  elsif p_action = 'unschedule' then
    update public.social_post_candidates set scheduled_for = null, updated_at = now() where candidate_id = p_candidate_id;

  else
    raise exception 'unknown action %', p_action;
  end if;

  perform private.social_audit(p_action, p_candidate_id, auth.uid(),
                               jsonb_strip_nulls(jsonb_build_object('reason', p_reason, 'scheduled_for', p_scheduled_for)));
  return jsonb_build_object('ok', true);
end;
$function$
;
