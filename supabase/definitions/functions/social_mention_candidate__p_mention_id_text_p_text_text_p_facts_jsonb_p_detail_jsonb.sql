-- Live definition exported from the database (function social_mention_candidate(p_mention_id text, p_text text, p_facts jsonb, p_detail jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_mention_candidate(p_mention_id text, p_text text, p_facts jsonb, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare m public.social_mentions; s public.social_settings; v_err jsonb; v_id bigint; v_auto boolean; v_hold timestamptz;
begin
  select * into m from public.social_mentions where x_post_id = p_mention_id for update;
  if m.x_post_id is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('mention not recorded')); end if;
  if m.candidate_id is not null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('already drafted'), 'candidate_id', m.candidate_id); end if;
  select * into s from public.social_settings where id;
  -- No link: a post with a link costs $0.200 v $0.015 and the week's one link is kept for the preview thread.
  v_err := public.social_reply_check(p_text, p_facts, false);
  if jsonb_array_length(v_err) > 0 then return jsonb_build_object('ok', false, 'errors', v_err); end if;
  insert into public.social_post_candidates (post_type, sport, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validated_at, approval_status, in_reply_to_x_id)
  values ('mention_reply', 'football', btrim(p_text), btrim(p_text),
          coalesce(p_detail, '{}') || jsonb_build_object(
            'facts', coalesce(p_facts, '[]'),
            'mention', jsonb_build_object('x_post_id', m.x_post_id, 'author', m.author_username, 'text', m.text, 'category', m.category,
                                          'url', format('https://x.com/%s/status/%s', coalesce(m.author_username, 'i'), m.x_post_id)),
            'checks', jsonb_build_array(
              jsonb_build_object('check', format('Replying to @%s: "%s"', m.author_username, private.digest_clip(regexp_replace(m.text, '\s+', ' ', 'g'), 160)),
                                 'ok', true, 'detail', format('https://x.com/%s/status/%s', coalesce(m.author_username, 'i'), m.x_post_id)),
              jsonb_build_object('check', 'every number is in our data; no link, @, betting or hype words; under 280', 'ok', true))),
          p_detail->>'model', now(), 'mention_reply:' || m.x_post_id,
          greatest(now(), coalesce(m.created_at_x, now())) + interval '48 hours', 'passed', now(), 'pending', m.x_post_id)
  returning candidate_id into v_id;
  update public.social_mentions set candidate_id = v_id where x_post_id = m.x_post_id;
  perform private.social_audit('mention_drafted', v_id, null, jsonb_build_object('mention', m.x_post_id, 'author', m.author_username));
  v_auto := s.auto_mention_replies and s.auto_publish_enabled;
  if v_auto then
    v_hold := now() + make_interval(mins => s.hold_minutes);
    update public.social_post_candidates set approval_status = 'approved', approved_at = now(), approved_by = null, auto = true,
           hold_until = v_hold, updated_at = now() where candidate_id = v_id;
    perform private.social_audit('auto_queued', v_id, null, jsonb_build_object('hold_until', v_hold, 'mention_reply', true));
  else
    update public.social_post_candidates set notified_at = now() where candidate_id = v_id;
    perform private.social_notify(jsonb_build_object('kind', 'draft', 'candidate_id', v_id));
  end if;
  return jsonb_build_object('ok', true, 'candidate_id', v_id, 'auto', v_auto);
end;
$function$
;
