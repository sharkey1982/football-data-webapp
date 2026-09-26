-- Live definition exported from the database (function export_schema_definitions()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.export_schema_definitions()
 RETURNS TABLE(kind text, name text, definition text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
$function$
;
