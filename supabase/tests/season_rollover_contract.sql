-- Read-only contract test for the season rollover (docs/season-rollover.md).
-- Run with psql (or execute_sql) after 20260927180000-20260927180600.
-- Raises on the first broken expectation.

do $rollover_contract$
declare
  n integer;
begin
  -- The 1 July boundary.
  if public.season_id_for_date(make_date(2027, 6, 30)) is distinct from (select season_id from public.seasons where label = '2627') then
    raise exception 'season_id_for_date(2027-06-30) is not 2026/27';
  end if;
  if public.season_id_for_date(make_date(1992, 8, 15)) is distinct from (select season_id from public.seasons where label = '9293') then
    raise exception 'season_id_for_date(1992-08-15) is not 1992/93';
  end if;
  if public.season_id_for_date(current_date) is not null
     and public.current_season_id() is distinct from public.season_id_for_date(current_date) then
    raise exception 'current_season_id() disagrees with season_id_for_date(today)';
  end if;

  -- No public function or view hard-codes a season id or label any more.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (pg_get_function_arguments(p.oid) ~ 'season_id bigint DEFAULT \d'
          or pg_get_functiondef(p.oid) ~ 'label\s*=\s*''\d{4}'''
          or pg_get_functiondef(p.oid) ~ 'fixturedownload\.com/feed/json/[a-z0-9-]+-20\d\d''');
  if n > 0 then
    raise exception '% public function(s) still hard-code a season', n;
  end if;

  -- The rollover self-check exists and is not failing.
  if not exists (select 1 from public.check_model_integrity() where check_name = 'season_rollover_ready' and status <> 'failed') then
    raise exception 'season_rollover_ready missing or failed';
  end if;

  -- The site and edge functions call these as anon.
  if not has_function_privilege('anon', 'public.current_season_id()', 'EXECUTE')
     or not has_function_privilege('anon', 'public.fpl_current_season_id()', 'EXECUTE') then
    raise exception 'anon cannot execute the current-season functions';
  end if;
end $rollover_contract$;
