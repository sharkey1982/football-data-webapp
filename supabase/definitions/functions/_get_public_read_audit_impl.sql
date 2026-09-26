-- Live definition exported from the database (function _get_public_read_audit_impl()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public._get_public_read_audit_impl()
 RETURNS TABLE(object_name text, object_kind text, rls_enabled boolean, has_select_policy boolean, anon_has_select_grant boolean, anon_can_read boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with objs as (
    select c.relname::text as nm,
      case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' end as kind,
      c.relkind, c.relrowsecurity
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'v', 'm')
  ),
  enriched as (
    select o.nm, o.kind, o.relkind, o.relrowsecurity,
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = o.nm and p.cmd in ('SELECT', 'ALL')
      ) as has_pol,
      exists (
        select 1 from information_schema.role_table_grants g
        where g.table_schema = 'public' and g.table_name = o.nm
          and g.grantee = 'anon' and g.privilege_type = 'SELECT'
      ) as has_grant
    from objs o
  )
  select nm, kind, relrowsecurity, has_pol, has_grant,
    case when relkind in ('v', 'm') then has_grant
         else has_grant and (not relrowsecurity or has_pol) end
  from enriched
  order by
    case when relkind in ('v', 'm') then has_grant
         else has_grant and (not relrowsecurity or has_pol) end,
    nm;
$function$
;
