-- ============================================================================
-- AI LAB: label batches with the current toolset, and queue a check batch for
-- toolset ai_tools_v2 / prompt analyst_v2 (20261011190000).
--
-- 1. ai_lab_enqueue_batch() wrote toolset_version 'ai_tools_v1' on every batch
--    whatever the function was running. Runs record their own toolset; batches
--    now say ai_tools_v2.
-- 2. One batch of 9 questions, sent to ai-lab-run by the existing pg_cron
--    queue (3 a minute), about $0.20:
--      A05 F26 G33 I41 H39 I45 J49  the 7 runs saved broken on 26 Sep
--                                   (markup swallowed answer_type/facts)
--      F27 F28                      questions the ranking tools should serve
--    Queued once only (guarded by name), so re-running this file is harmless.
-- ============================================================================

create or replace function public.ai_lab_enqueue_batch(p_name text, p_model text, p_prompt_id text, p_question_ids text[])
returns bigint language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare b bigint;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(array_length(p_question_ids, 1), 0) = 0 then raise exception 'no questions'; end if;
  insert into public.ai_batches (name, provider, model, prompt_id, toolset_version, question_ids, created_by)
  values (p_name, 'anthropic', p_model, p_prompt_id, 'ai_tools_v2', p_question_ids, auth.uid())
  returning batch_id into b;
  insert into public.ai_batch_items (batch_id, question_id)
  select b, q from unnest(p_question_ids) q
  on conflict do nothing;
  return b;
end $$;
revoke all on function public.ai_lab_enqueue_batch(text, text, text, text[]) from public, anon;
grant execute on function public.ai_lab_enqueue_batch(text, text, text, text[]) to authenticated, service_role;

do $$
begin
  if not exists (select 1 from public.ai_batches where name = 'ai_tools_v2 check (11 Oct)') then
    perform public.ai_lab_enqueue_batch('ai_tools_v2 check (11 Oct)', 'claude-sonnet-5', 'analyst_v2',
      array['A05', 'F26', 'G33', 'I41', 'H39', 'I45', 'J49', 'F27', 'F28']);
  end if;
end $$;
