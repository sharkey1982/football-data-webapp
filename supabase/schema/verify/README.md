# Verifying the schema baseline

`../public.sql` should rebuild the public schema exactly. To check it (for
example after schema changes, or after regenerating it):

1. Start an empty PostgreSQL 17 (16 works if you strip `MAINTAIN` from the
   GRANT lines -- it is a PostgreSQL 17 privilege).
2. Create the Supabase stand-ins: `psql -f supabase-stubs.sql` (roles
   anon/authenticated/service_role, the auth.uid()/auth.role() functions,
   auth.users, cron.job tables, extensions.http_get).
3. Restore: `psql -v ON_ERROR_STOP=0 -f ../public.sql`, leaving out the
   `CREATE EXTENSION` lines for Supabase-only extensions (pg_cron, pg_net,
   http, supabase_vault). Expect zero errors.
4. Run `fingerprint.sql` on the restored copy and on production (e.g. via
   the Supabase SQL editor). Every row must match.

Last verified 2026-09-21: zero errors; every fingerprint row matched.
