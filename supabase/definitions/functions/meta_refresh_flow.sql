-- Live definition exported from the database (function meta_refresh_flow()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.meta_refresh_flow()
 RETURNS TABLE(nodes integer, edges integer, changes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n_changes int := 0;
begin
  if not (public.is_admin() or current_user in ('postgres','service_role')) then
    raise exception 'admin only';
  end if;

  create temp table _now on commit drop as
  -- tables and views: fingerprint the definition (views) or the column list (tables)
  select 'table:'||c.relname as node_key, case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' end as kind,
         c.relname as obj_name,
         md5(coalesce(pg_get_viewdef(c.oid, true),
             (select string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod), ',' order by a.attnum)
              from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))) as definition_hash,
         (select s.n_live_tup from pg_stat_user_tables s where s.relid=c.oid) as row_estimate
  from pg_class c
  where c.relnamespace='public'::regnamespace and c.relkind in ('r','v','m')
  union all
  select 'function:'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', 'function',
         p.proname, md5(pg_get_functiondef(p.oid)), null
  from pg_proc p
  where p.pronamespace='public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e');
  -- tables and views share a prefix so a view becoming a table is a change, not a new node
  update _now set node_key = replace(node_key,'table:','object:') where kind in ('table','view','matview');

  -- history: what is new, what changed, what has gone
  insert into public.meta_flow_history (node_key, change, detail)
  select n.node_key, 'added', n.kind||' first seen' from _now n
  left join public.meta_flow_nodes m on m.node_key=n.node_key where m.node_key is null;
  get diagnostics n_changes = row_count;

  insert into public.meta_flow_history (node_key, change, detail)
  select n.node_key, 'definition changed', 'definition fingerprint moved'
  from _now n join public.meta_flow_nodes m on m.node_key=n.node_key
  where m.definition_hash <> n.definition_hash and m.is_present;
  n_changes := n_changes + coalesce((select count(*) from _now n join public.meta_flow_nodes m on m.node_key=n.node_key
    where m.definition_hash <> n.definition_hash and m.is_present),0);

  insert into public.meta_flow_history (node_key, change, detail)
  select m.node_key, 'disappeared', 'no longer in the database'
  from public.meta_flow_nodes m left join _now n on n.node_key=m.node_key
  where n.node_key is null and m.is_present;
  n_changes := n_changes + coalesce((select count(*) from public.meta_flow_nodes m
    left join _now n on n.node_key=m.node_key where n.node_key is null and m.is_present),0);

  insert into public.meta_flow_history (node_key, change, detail)
  select m.node_key, 'returned', 'present again'
  from public.meta_flow_nodes m join _now n on n.node_key=m.node_key where not m.is_present;

  -- upsert structure; human columns are never touched
  insert into public.meta_flow_nodes (node_key, kind, obj_name, definition_hash, row_estimate)
  select node_key, kind, obj_name, definition_hash, row_estimate from _now
  on conflict (node_key) do update
    set kind=excluded.kind, obj_name=excluded.obj_name, definition_hash=excluded.definition_hash,
        row_estimate=excluded.row_estimate, last_seen=now(), is_present=true;
  update public.meta_flow_nodes m set is_present=false
  where m.is_present and not exists (select 1 from _now n where n.node_key=m.node_key);

  -- edges: views and matviews from the catalogue; functions by reading their bodies
  delete from public.meta_flow_edges where source <> 'manual';
  insert into public.meta_flow_edges (parent_key, child_key, source)
  select distinct 'object:'||src.relname, 'object:'||v.relname, 'catalog'
  from pg_rewrite r join pg_class v on v.oid=r.ev_class
  join pg_depend d on d.objid=r.oid join pg_class src on src.oid=d.refobjid
  where v.relnamespace='public'::regnamespace and src.relnamespace='public'::regnamespace
    and v.relkind in ('v','m') and src.relkind in ('r','v','m') and src.oid<>v.oid
  on conflict do nothing;
  insert into public.meta_flow_edges (parent_key, child_key, source)
  select distinct 'object:'||c.relname, f.node_key, 'parsed'
  from (select 'function:'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' node_key, pg_get_functiondef(p.oid) def
        from pg_proc p where p.pronamespace='public'::regnamespace
          and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')) f
  join pg_class c on c.relnamespace='public'::regnamespace and c.relkind in ('r','v','m')
   and f.def ~* ('(^|[^.[:alnum:]_])(public\.)?'||c.relname||'([^[:alnum:]_]|$)')
  on conflict do nothing;

  return query select (select count(*)::int from public.meta_flow_nodes where is_present),
                      (select count(*)::int from public.meta_flow_edges), n_changes;
end $function$
;
