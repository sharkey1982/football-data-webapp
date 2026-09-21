-- Schema fingerprint: run on production AND on a restored copy; every row
-- must match. Counts, plus md5 hashes of columns/types, constraint and index
-- names, policies (with their conditions), functions (with SECURITY DEFINER
-- and search_path settings), security_invoker views, and exactly which
-- tables/functions anon and authenticated can read, write and call.
-- Sorting is forced to collate "C": production and a local test server sort
-- text differently ('(' vs '_'), which changes a hash of an ordered list
-- even when the contents are identical.
with ext as (select objid from pg_depend where deptype='e')
select 'tables' k, count(*)::text v from pg_class where relnamespace='public'::regnamespace and relkind='r'
union all select 'views', count(*)::text from pg_class where relnamespace='public'::regnamespace and relkind='v'
union all select 'functions', count(*)::text from pg_proc p where pronamespace='public'::regnamespace and prokind='f' and oid not in (select objid from ext)
union all select 'policies', count(*)::text from pg_policies where schemaname='public'
union all select 'triggers', count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal
union all select 'indexes', count(*)::text from pg_index i join pg_class c on c.oid=i.indrelid where c.relnamespace='public'::regnamespace and c.relkind='r'
union all select 'constraints', count(*)::text from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace
union all select 'rls_tables', count(*)::text from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity
union all select 'columns_md5', md5(string_agg(c.relname||'.'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||a.attidentity::text, ',' order by c.relname collate "C", a.attnum))
  from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where c.relnamespace='public'::regnamespace and c.relkind in ('r','v')
union all select 'constraint_names_md5', md5(string_agg(c.relname||'.'||k.conname||':'||k.contype::text, ',' order by c.relname collate "C", k.conname collate "C"))
  from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace
union all select 'index_names_md5', md5(string_agg(ic.relname, ',' order by ic.relname collate "C")) from pg_index i join pg_class ic on ic.oid=i.indexrelid join pg_class c on c.oid=i.indrelid where c.relnamespace='public'::regnamespace and c.relkind='r'
union all select 'policies_md5', md5(string_agg(tablename||'.'||policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,'|')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename collate "C", policyname collate "C")) from pg_policies where schemaname='public'
union all select 'functions_md5', md5(string_agg(p.oid::regprocedure::text||':'||p.prosecdef::text||':'||coalesce(array_to_string(p.proconfig,'|'),''), ',' order by p.oid::regprocedure::text collate "C"))
  from pg_proc p where pronamespace='public'::regnamespace and prokind='f' and oid not in (select objid from ext)
union all select 'invoker_views_md5', md5(string_agg(relname, ',' order by relname collate "C")) from pg_class where relnamespace='public'::regnamespace and relkind='v' and coalesce(array_to_string(reloptions,','),'') like '%security_invoker=true%'
union all select 'anon_readable_md5', md5(string_agg(relname, ',' order by relname collate "C")) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') and has_table_privilege('anon', oid, 'select')
union all select 'anon_writable_md5', md5(coalesce(string_agg(relname, ',' order by relname collate "C"),'none')) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') and (has_table_privilege('anon', oid, 'insert') or has_table_privilege('anon', oid, 'update') or has_table_privilege('anon', oid, 'delete'))
union all select 'auth_readable_md5', md5(string_agg(relname, ',' order by relname collate "C")) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') and has_table_privilege('authenticated', oid, 'select')
union all select 'anon_callable_md5', md5(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text collate "C")) from pg_proc p where pronamespace='public'::regnamespace and prokind='f' and oid not in (select objid from ext) and has_function_privilege('anon', p.oid, 'execute')
union all select 'auth_callable_md5', md5(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text collate "C")) from pg_proc p where pronamespace='public'::regnamespace and prokind='f' and oid not in (select objid from ext) and has_function_privilege('authenticated', p.oid, 'execute')
order by 1;
