-- ============================================================================
-- Pin search_path on every public function that lacked one (Supabase advisor
-- 0011, 61 functions). Without it, the CALLER's search_path decides which
-- objects a function resolves -- the classic way a function is tricked into
-- reading or writing someone else's table.
--
-- Checked before applying:
--   * none reference auth/storage/cron/net;
--   * the two using `extensions.` qualify it, so the path is irrelevant;
--   * no function calls an extension function unqualified (unaccent lives in
--     public, covering the six that use it);
--   * the four unaccent functions belong to the extension and are left alone
--     (which is why the advisor counted 61 of 65).
-- pg_temp last, so a temporary table cannot shadow a real one.
--
-- Verified after: 20 representative functions return results IDENTICAL to the
-- baseline taken beforehand (slugs, search, model accuracy, market
-- efficiency, digest, team of the week, optimiser, projection snapshot,
-- derived markets, player career...); the seven trigger functions fire
-- cleanly on writes; backfill_fixture_predictions still refreshes 1,807
-- fixtures, both as owner and as service_role (the nightly pipeline's role).
-- All checks run in rolled-back transactions.
-- ============================================================================
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
    n := n + 1;
  end loop;
  raise notice 'pinned search_path on % functions', n;
end $$;
