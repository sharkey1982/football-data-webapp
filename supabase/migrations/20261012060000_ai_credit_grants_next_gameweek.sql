-- ============================================================================
-- Two fixes found on 12 Oct.
--
-- 1. AI CREDIT: "permission denied for table ai_credit_checks" when Chris
--    saved his Console balance. New tables in this project get no table
--    privileges for the API roles by default (RLS alone isn't enough), and
--    20261012050000 didn't grant any. Admin-only RLS still applies.
--
-- 2. AI TOOLS: "next gameweek" meant the first gameweek not yet FINISHED.
--    While a gameweek is in progress (GW6 on 12 Oct: deadline passed 10 Oct,
--    matches still running) that is the locked, in-play gameweek, so "best
--    pair for next gameweek" answered for GW6 instead of GW7. The tools also
--    labelled a single gameweek as "gameweeks": "6", which the model read
--    as "6 gameweeks" (run 36). Now:
--      * default = first gameweek whose deadline is still to come
--        (ai_next_fpl_gameweek), falling back to first unfinished;
--      * labels say "GW7" or "GW7-GW9".
--    Applied to the four tools that default a gameweek, by rewriting their
--    current definitions in place (grants are kept by CREATE OR REPLACE).
--    Re-running is harmless: a definition already rewritten is skipped, and
--    one matching neither form stops the migration rather than passing.
-- ============================================================================

-- 1. Grants -------------------------------------------------------------------
grant select, insert, delete on public.ai_credit_checks to authenticated;
grant usage, select on sequence public.ai_credit_checks_check_id_seq to authenticated;
grant select on public.ai_external_spend to authenticated;
grant all on public.ai_credit_checks, public.ai_external_spend to service_role;

-- 2. Next gameweek ------------------------------------------------------------
create or replace function public.ai_next_fpl_gameweek(p_season bigint)
returns int language sql stable set search_path to 'public', 'pg_temp' as $$
  select coalesce(
    (select min(fpl_event_id) from fpl_gameweeks where season_id = p_season and deadline_time > now()),
    (select min(fpl_event_id) from fpl_gameweeks where season_id = p_season and not finished))
$$;
revoke all on function public.ai_next_fpl_gameweek(bigint) from public, anon, authenticated;
grant execute on function public.ai_next_fpl_gameweek(bigint) to service_role;

do $$
declare
  f text;
  d text;
  n text;
begin
  foreach f in array array['ai_tool_get_fpl_projections', 'ai_tool_compare_fixture_runs', 'ai_tool_best_fpl_combination', 'ai_tool_compare_fpl_players'] loop
    d := pg_get_functiondef(('public.' || f || '(jsonb)')::regprocedure);
    if position('ai_next_fpl_gameweek' in d) > 0 then
      raise notice '% already uses ai_next_fpl_gameweek; skipped', f;
      continue;
    end if;
    -- default gameweek
    n := regexp_replace(d,
      '\(select min\(fpl_event_id\) from fpl_gameweeks(, \w+)? where season_id = (\w+(\.cur)?) and not finished\)',
      'public.ai_next_fpl_gameweek(\2)', 'g');
    -- labels: single gameweek / range
    n := replace(n, 'then g.gw::text else g.gw || ''-'' || (g.gw + p.n_gw - 1) end',
                    'then ''GW'' || g.gw else ''GW'' || g.gw || ''-GW'' || (g.gw + p.n_gw - 1) end');
    n := replace(n, 'then gw::text else gw || ''-'' || (gw + n_gw - 1) end',
                    'then ''GW'' || gw else ''GW'' || gw || ''-GW'' || (gw + n_gw - 1) end');
    n := replace(n, '(select g0 || ''-'' || g1 from r)', '(select ''GW'' || g0 || ''-GW'' || g1 from r)');
    if position('ai_next_fpl_gameweek' in n) = 0 or position('''GW''' in n) = 0 then
      raise exception '% did not match the expected definition; not changed', f;
    end if;
    execute n;
  end loop;
end $$;
