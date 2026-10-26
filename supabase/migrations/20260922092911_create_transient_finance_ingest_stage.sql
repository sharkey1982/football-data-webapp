-- History only (reconciled 2026-10-26): applied in production on 2026-09-22
-- through the connector during the initial finance ingestion and recorded in
-- supabase_migrations.schema_migrations, but never committed. It predates the
-- apply-migrations FLOOR (20261005100000), so the workflow never replays it.
-- The table was later renamed (20260924045456) and dropped by
-- 20261022122000_security_hardening.sql.
create table public.finance_ingest_stage_tmp(club_slug text not null,y int not null,s date not null,e date not null,si bigint not null,fd date not null,fr text not null,d text not null,h text not null,j jsonb not null,primary key(club_slug,y));
alter table public.finance_ingest_stage_tmp enable row level security;
