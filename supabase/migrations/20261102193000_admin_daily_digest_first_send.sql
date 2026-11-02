-- First admin daily site update (Chris, 2 Nov 2026: "trigger one test send
-- for today so Chris gets an example tonight"). Sends Mon 2 Nov's digest as
-- that day's scheduled send (private.admin_digest_sends allows one per London
-- date), so the 20:00 tick never sends a second one. If the tick already sent
-- it, this does nothing. Safe to re-run: admin_digest_send returns
-- 'already sent'.
select private.admin_digest_send(date '2026-11-02', 'scheduled');
