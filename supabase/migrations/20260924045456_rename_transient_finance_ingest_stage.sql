-- History only (reconciled 2026-10-26): applied in production on 2026-09-24
-- and recorded in supabase_migrations.schema_migrations, but never committed.
-- Predates the apply-migrations FLOOR, so it is never replayed. The renamed
-- table was dropped by 20261022122000_security_hardening.sql.
alter table public.finance_ingest_stage_tmp rename to ingest_finance_stage_tmp;
