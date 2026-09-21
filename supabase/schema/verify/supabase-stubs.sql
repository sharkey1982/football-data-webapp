-- Stand-ins for what Supabase provides, so the baseline can be tested on plain PostgreSQL.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA cron;
CREATE TABLE auth.users (id uuid PRIMARY KEY, confirmation_token text, recovery_token text, email_change_token_new text, email_change text,
  email_change_token_current text, phone_change text, phone_change_token text, reauthentication_token text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE TABLE cron.job (jobid bigint, jobname text, schedule text, command text);
CREATE TABLE cron.job_run_details (jobid bigint, status text, start_time timestamptz, end_time timestamptz, return_message text);
CREATE FUNCTION extensions.http_get(text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
