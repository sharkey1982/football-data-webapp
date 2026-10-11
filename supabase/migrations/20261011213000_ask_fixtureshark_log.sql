-- ============================================================================
-- ASK FIXTURESHARK (admin-only trial, /admin/ask): one standing batch that
-- files every question asked on the page, so the answers
--   * are listed together on the Ask page (history),
--   * appear in the AI Lab Review tab, for marking with the existing form,
--   * have their cost totalled in the AI Lab batch table.
-- It has no question_ids and no ai_batch_items, so the pg_cron queue never
-- sends anything for it: runs only happen when Chris asks a question.
-- Data only, no schema change. Guarded by name, so re-running is harmless.
-- ============================================================================

insert into public.ai_batches (name, provider, model, prompt_id, toolset_version, question_ids, status, notes, created_by)
select 'Ask FixtureShark', 'anthropic', 'claude-sonnet-5', 'analyst_v2', 'ai_tools_v2', '{}', 'running',
       'Free-text questions asked on /admin/ask (admin-only trial, step 2 of docs/ai-lab/design.md).', null
where not exists (select 1 from public.ai_batches where name = 'Ask FixtureShark');
