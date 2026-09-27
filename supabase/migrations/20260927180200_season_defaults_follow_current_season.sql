-- p_season_id defaults follow the current season instead of 13 (2026/27).
--
-- 21 public functions declared `p_season_id bigint DEFAULT 13`. After the
-- 2027/28 rollover any caller relying on the default (including the site,
-- which now omits the argument) would have kept reading 2026/27. The default
-- is now evaluated per call:
--   * FPL functions -> public.fpl_current_season_id() (latest season FPL has
--     published gameweeks for; rolls over when the new game's data loads)
--   * get_betting_bets / get_betting_returns -> public.current_season_id()
--     (football season, 1 July boundary)
-- Both return 13 today, so results are unchanged. Only the header default
-- changes (asserted exactly once per function); grants and bodies are
-- untouched. A default is evaluated once per call, not per row.

do $mig$
declare r record; d text; n int := 0; v_default text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and pg_get_function_arguments(p.oid) ~ 'p_season_id bigint DEFAULT 13\M'
     order by p.proname
  loop
    v_default := case when r.proname in ('get_betting_bets', 'get_betting_returns')
                      then 'public.current_season_id()' else 'public.fpl_current_season_id()' end;
    d := pg_get_functiondef(r.oid);
    if (select count(*) from regexp_matches(d, 'p_season_id bigint DEFAULT 13[,)]', 'g')) <> 1 then
      raise exception '%: expected exactly one "p_season_id bigint DEFAULT 13"', r.proname;
    end if;
    d := regexp_replace(d, 'p_season_id bigint DEFAULT 13([,)])', 'p_season_id bigint DEFAULT ' || v_default || '\1');
    execute d;
    n := n + 1;
  end loop;
  if n <> 21 then raise exception 'expected 21 functions with p_season_id DEFAULT 13, changed %', n; end if;
end $mig$;
