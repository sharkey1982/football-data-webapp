-- DQ-17 (audit 22 Oct 2026), broadcast items.
--
-- 1. Borussia Dortmund v Werder Bremen (fixture 3964, 9 Oct) had two identical
--    BBC rows (160 and 1554), from two Airtable records. Airtable sync is gone
--    (20261022150000_broadcasts_claude_research.sql), so a delete stays
--    deleted. Keep 1554, which matches the sibling Samsung TV Plus row's
--    source; drop 160.
-- 2. Integrity checks (warnings) so this does not recur unseen:
--    broadcast_duplicate_rows  -- same fixture, market, broadcaster and channel twice
--    broadcast_on_postponed    -- a live listing on a postponed fixture
--    Today the second lists Scunthorpe v Forest Green (6186, 3 Oct, DAZN):
--    the National League listing says it was live while the National League
--    feed marked it postponed. No source settles which is right, so the row
--    stays and the warning asks for a look.
-- Safe to re-run.

delete from public.fixture_broadcasts
 where broadcast_id = 160 and fixture_id = 3964 and broadcaster = 'BBC'
   and exists (select 1 from public.fixture_broadcasts o
               where o.broadcast_id = 1554 and o.fixture_id = 3964 and o.broadcaster = 'BBC');

do $mig$
declare
  d text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  a text := $a$  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$a$;
  b text := $b$  -- DQ-17 (2026-10-22): one row per fixture, market, broadcaster and channel.
  select 'broadcast_duplicate_rows', case when n = 0 then 'ok' else 'warning' end, n,
    'fixture_broadcasts rows repeated for the same fixture, market, broadcaster and channel (fixture market broadcaster (ids)): ' || coalesce(ids, 'none')
  from (select count(*) n, string_agg(fixture_id || ' ' || market || ' ' || broadcaster || ' (' || ids || ')', ', ') ids
        from (select b.fixture_id, b.market, b.broadcaster, string_agg(b.broadcast_id::text, ',' order by b.broadcast_id) ids
                from public.fixture_broadcasts b where b.broadcaster is not null
               group by b.fixture_id, b.market, b.broadcaster, coalesce(b.channel, '') having count(*) > 1) d) x
  union all
  -- DQ-17 (2026-10-22): a postponed fixture should not carry a live listing.
  select 'broadcast_on_postponed', case when n = 0 then 'ok' else 'warning' end, n,
    'Live broadcast rows on postponed fixtures (check the postponement or remove the row): ' || coalesce(ids, 'none')
  from (select count(*) n, string_agg(f.slug || ' ' || coalesce(b.broadcaster, '?') || ' (' || b.broadcast_id || ')', ', ' order by f.kickoff_date) ids
        from public.fixture_broadcasts b join public.fixtures f on f.fixture_id = b.fixture_id
        where f.status = 'postponed' and b.status <> 'confirmed_not_televised') x
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$b$;
begin
  if position('broadcast_duplicate_rows' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'check_model_integrity anchor not found exactly once'; end if;
  execute replace(d, a, b);
end;
$mig$;
