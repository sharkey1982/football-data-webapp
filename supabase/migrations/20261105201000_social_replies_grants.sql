-- ============================================================================
-- Fix for 20261105200000_social_replies.sql (5 Nov 2026): x-replies writes
-- its runs, ideas, mentions and account checks with the service role, but
-- new tables here only get SELECT for service_role by default, so the first
-- read cycle stopped at "permission denied for table social_reply_runs"
-- before calling X (nothing read, nothing spent). Grant the writes it needs,
-- then run the first read of each kind again.
-- Safe to re-run: grants are idempotent; the two calls only start reads,
-- which the budget check and since_id keep cheap.
-- ============================================================================
grant insert, update on public.social_reply_runs, public.social_reply_ideas, public.social_mentions to service_role;
grant update on public.social_reply_accounts to service_role;
grant usage, select on sequence public.social_reply_runs_run_id_seq, public.social_reply_ideas_idea_id_seq to service_role;

select private.social_replies_call('ideas', 'first-run');
select private.social_replies_call('mentions', 'first-run');
