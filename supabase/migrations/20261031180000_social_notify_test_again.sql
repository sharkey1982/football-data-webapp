-- Second alert-email test (31 Oct 2026): RESEND_API_KEY replaced after the
-- first test was rejected as "API key is invalid". Re-running sends another
-- test email, which is harmless.
select private.social_notify('{"kind":"test"}'::jsonb);
