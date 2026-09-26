-- ============================================================================
-- (applied live 26 Sep 2026)
--
-- 1) No more hard-coded FPL season. 23 objects (17 projection-chain views,
--    6 functions; 37 occurrences) compared season_id to the literal 13.
--    They now use fpl_current_season_id(): the latest season FPL has
--    published gameweeks for, so the model rolls over by itself when next
--    season's bootstrap is loaded. Written as (SELECT ...) so it runs once
--    per query, not per row. Rewritten in one transaction that recomputed
--    the projection checksums for four fixtures and would have rolled back
--    on any difference: identical rows and points; timings unchanged
--    (0.54-0.77s vs 0.56-0.89s). View permissions preserved (e.g.
--    fpl_projection_fixture_readiness stays server-only).
--    The rewritten definitions are in supabase/definitions/.
--    Still hard-coded outside the database: the Python scripts' --season-id
--    default and the workflows that pass "13".
--
-- 2) export_schema_definitions(): every public view/function as executable
--    SQL, for scripts/export_db_definitions.py (weekly workflow).
-- ============================================================================

create or replace function public.fpl_current_season_id()
returns bigint language sql stable security definer set search_path to 'public', 'pg_catalog' as $$
  select max(season_id) from public.fpl_gameweeks;
$$;
grant execute on function public.fpl_current_season_id() to anon, authenticated;

-- (the 23-object rewrite ran as a one-off DO block; its result is the
-- exported definitions, which are the source of truth from here)

create or replace function public.export_schema_definitions()
returns table(kind text, name text, definition text)
language sql stable security definer set search_path to 'public', 'pg_catalog' as $$
  select 'view', c.relname::text,
    format('create or replace view public.%I%s as%s%s;', c.relname,
      case when c.reloptions is null then '' else ' with (' || array_to_string(c.reloptions, ', ') || ')' end,
      E'\n', rtrim(pg_get_viewdef(c.oid), ';'))
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  union all
  select 'materialized_view', c.relname::text,
    format('create materialized view public.%I as%s%s;', c.relname, E'\n', rtrim(pg_get_viewdef(c.oid), ';'))
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'm'
  union all
  select 'function', p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    pg_get_functiondef(p.oid) || ';'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  order by 1, 2;
$$;
revoke all on function public.export_schema_definitions() from public, anon, authenticated;
grant execute on function public.export_schema_definitions() to service_role;
