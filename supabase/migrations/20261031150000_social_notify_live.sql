-- Alert emails go live (31 Oct 2026).
-- RESEND_API_KEY is set in Supabase and mail.fixtureshark.com is verified in
-- Resend. The social-notify edge function (v10) now sends from
-- alerts@mail.fixtureshark.com and has a { kind: "test" } message.
--
-- 1. The edge function writes its outcome (notified / notify_failed /
--    notify_skipped) to social_audit_log as service_role, which had no INSERT
--    grant, so every one of those rows was silently lost.
grant insert on public.social_audit_log to service_role;

-- 2. Send one test email so Chris can see it arrive. Harmless if re-run
--    (another test email).
select private.social_notify('{"kind":"test"}'::jsonb);
