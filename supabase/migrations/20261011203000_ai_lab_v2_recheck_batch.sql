-- ============================================================================
-- AI LAB: re-check after ai-lab-run v5 (trailing tags accepted, grader
-- checks_v2; PR #342). Three questions through the pg_cron queue, about $0.12:
--   F27  ran out of rounds in batch 2 (good answers rejected for a trailing tag)
--   F26  one rejection in batch 2
--   H39  four rejections in batch 2
-- Queued once only (guarded by name).
-- ============================================================================
do $$
begin
  if not exists (select 1 from public.ai_batches where name = 'ai_tools_v2 recheck after v5 (11 Oct)') then
    perform public.ai_lab_enqueue_batch('ai_tools_v2 recheck after v5 (11 Oct)', 'claude-sonnet-5', 'analyst_v2',
      array['F27', 'F26', 'H39']);
  end if;
end $$;
