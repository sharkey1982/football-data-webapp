-- ============================================================================
-- Chris, 28 Oct 2026, after the Venezia v Inter daily market post: "maybe run
-- these mismatch posts by me first? The quiz question post is also pretty
-- rubbish".
--
-- 1. A daily market post that leads with a model-v-market gap is no longer
--    queued automatically: it stays a draft for Chris to approve on
--    /admin/social, and he is emailed once (social-notify kind "draft").
--    Days with no gap (a results review only) still go automatically.
-- 2. The quiz is switched off: out of auto_post_types and out of the hourly
--    detector run, until a better format is agreed. Answers to a question
--    already posted still go (quiz_answer stays automatic).
-- ============================================================================

update public.social_settings set auto_post_types = array_remove(auto_post_types, 'quiz')
 where 'quiz' = any(auto_post_types);

create or replace function pg_temp.social_patch(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'social_patch: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;

select pg_temp.social_patch('private.social_auto_queue()',
  $o$  loop
    v_errors := private.social_revalidate(c.candidate_id);$o$,
  $n$  loop
    -- Model-v-market gap posts wait for Chris (28 Oct 2026): emailed once, never queued here.
    if c.post_type = 'daily_market' and jsonb_typeof(c.source_data->'mismatch') = 'object' then
      if c.notified_at is null then
        perform private.social_notify(jsonb_build_object('kind', 'draft', 'candidate_id', c.candidate_id));
        update public.social_post_candidates set notified_at = now() where candidate_id = c.candidate_id;
      end if;
      continue;
    end if;
    v_errors := private.social_revalidate(c.candidate_id);$n$);

select pg_temp.social_patch('public.social_run_detectors(text)',
  $o$'fixture_moves', 'quiz', 'fact'$o$,
  $n$'fixture_moves', 'fact'$n$);
