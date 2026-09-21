-- Read-only contract test for the finance schema.
-- Run with psql against the target database after finance migrations.

do $finance_contract$
declare
  finance_tables integer;
  rls_tables integer;
  invoker_views integer;
  public_policies integer;
  dictionary_metrics integer;
  unsafe_browser_grants integer;
begin
  select count(*) into finance_tables
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relkind = 'r'
    and relname like 'finance_%';

  select count(*) into rls_tables
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relkind = 'r'
    and relname like 'finance_%'
    and relrowsecurity;

  select count(*) into invoker_views
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relkind = 'v'
    and relname like 'finance_%'
    and reloptions @> array['security_invoker=true'];

  select count(*) into public_policies
  from pg_policies
  where schemaname = 'public'
    and tablename like 'finance_%';

  select count(*) into dictionary_metrics
  from public.finance_metric_dictionary;

  select count(*) into unsafe_browser_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'finance_%'
    and grantee in ('anon', 'authenticated')
    and privilege_type <> 'SELECT';

  if finance_tables <> 8 then
    raise exception 'finance contract: expected 8 tables, found %', finance_tables;
  end if;
  if rls_tables <> 8 then
    raise exception 'finance contract: expected RLS on 8 tables, found %', rls_tables;
  end if;
  if invoker_views <> 3 then
    raise exception 'finance contract: expected 3 security-invoker views, found %', invoker_views;
  end if;
  if public_policies <> 3 then
    raise exception 'finance contract: expected 3 public-read policies, found %', public_policies;
  end if;
  if dictionary_metrics <> 18 then
    raise exception 'finance contract: expected 18 dictionary metrics, found %', dictionary_metrics;
  end if;
  if unsafe_browser_grants <> 0 then
    raise exception 'finance contract: found % unsafe browser grants', unsafe_browser_grants;
  end if;
  if has_table_privilege('anon', 'public.finance_raw_facts', 'select') then
    raise exception 'finance contract: anon can read raw facts';
  end if;
  if not has_table_privilege('anon', 'public.finance_published_periods', 'select') then
    raise exception 'finance contract: anon cannot read published periods';
  end if;
  if not has_table_privilege('service_role', 'public.finance_raw_facts', 'insert') then
    raise exception 'finance contract: service_role cannot insert raw facts';
  end if;
end
$finance_contract$;
