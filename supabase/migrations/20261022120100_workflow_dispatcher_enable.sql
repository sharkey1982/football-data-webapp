-- ============================================================================
-- Turn on the pg_cron workflow dispatcher (audit P-01, part 2).
--
-- Part 1 (20261022120000_workflow_dispatcher.sql) created it disabled. This
-- PR deploys the Netlify side: trigger-workflow accepts the x-workflow-token
-- header (env WORKFLOW_TRIGGER_TOKEN, set on 22 Oct 2026 from the Vault
-- secret workflow_trigger_token, production context) and the four workflows
-- gain a gate job that skips a late GitHub cron run when its slot was
-- already dispatched.
--
-- If the Netlify deploy lands a minute or two after this, the first requests
-- get 401, are retried (max_attempts) and, failing that, the GitHub cron
-- fallback runs as before. Safe to re-run.
--
-- To pause: update private.workflow_dispatch_settings set enabled = false;
-- (in a migration). What was sent:
--   select * from private.workflow_dispatches order by dispatch_id desc;
-- ============================================================================
update private.workflow_dispatch_settings
   set enabled = true, updated_at = now()
 where id and not enabled;
