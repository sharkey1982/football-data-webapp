-- Audit 2026-10-22, DQ-11 (b): "previous season" chosen by season_id.
--
-- refresh_fpl_start_record and fixture_player_expected_minutes_fallback took
-- last season's FPL history as max(season_id) where season_id < current.
-- Season ids are not chronological (14-35 are 1992/93-2013/14), so that only
-- works while the history table holds nothing older than id 8. Both now take
-- the latest season BEFORE the current one by seasons.start_year that has
-- history rows, as fpl_current_season_id() already orders by start_year.
-- Today both rules give season 12 (2025/26); the DO block checks that, so
-- nothing changes in today's numbers.
--
-- Edited from the LIVE definitions by exact text replacement (the pattern of
-- 20260923160000), so other changes to these objects are kept. Safe to re-run:
-- each step returns early once the new text is present.

do $$
declare
  old_sub text := 'select max(season_id) from public.fpl_player_gameweek_history where season_id < v_season';
  new_sub text := 'select se.season_id from public.seasons se'
               || ' where se.start_year < (select sc.start_year from public.seasons sc where sc.season_id = v_season)'
               || ' and exists (select 1 from public.fpl_player_gameweek_history hx where hx.season_id = se.season_id)'
               || ' order by se.start_year desc limit 1';
  def text := pg_get_functiondef('public.refresh_fpl_start_record()'::regprocedure);
  n int;
begin
  if position(new_sub in def) > 0 then return; end if;
  n := (length(def) - length(replace(def, old_sub, ''))) / length(old_sub);
  if n <> 1 then raise exception 'refresh_fpl_start_record: expected 1 match of the previous-season sub-query, found %', n; end if;
  execute replace(def, old_sub, new_sub);
end $$;

do $$
declare
  -- pg_get_viewdef's spacing is not stable, so match the sub-query with \s+.
  old_re text := '\(\s*SELECT max\(h2\.season_id\) AS max\s+FROM fpl_player_gameweek_history h2\s+WHERE \(h2\.season_id < \(\s*SELECT fpl_current_season_id\(\) AS fpl_current_season_id\)\)\)';
  new_sub text := '( SELECT se.season_id FROM public.seasons se'
               || ' WHERE se.start_year < (SELECT sc.start_year FROM public.seasons sc WHERE sc.season_id = public.fpl_current_season_id())'
               || ' AND EXISTS (SELECT 1 FROM public.fpl_player_gameweek_history hx WHERE hx.season_id = se.season_id)'
               || ' ORDER BY se.start_year DESC LIMIT 1)';
  def text := pg_get_viewdef('public.fixture_player_expected_minutes_fallback'::regclass);
  opts text;
  n int;
begin
  if position('se.start_year' in def) > 0 then return; end if;
  select count(*) into n from regexp_matches(def, old_re, 'g');
  if n <> 1 then raise exception 'fixture_player_expected_minutes_fallback: expected 1 match of the previous-season sub-query, found %', n; end if;
  select array_to_string(reloptions, ', ') into opts from pg_class where oid = 'public.fixture_player_expected_minutes_fallback'::regclass;
  execute 'create or replace view public.fixture_player_expected_minutes_fallback'
       || case when opts is null or opts = '' then '' else ' with (' || opts || ')' end
       || ' as ' || regexp_replace(def, old_re, new_sub);
end $$;

-- Today's answer must be unchanged: the old rule and the new rule agree.
do $$
declare old_prev bigint; new_prev bigint;
begin
  select max(season_id) into old_prev from public.fpl_player_gameweek_history where season_id < public.fpl_current_season_id();
  select se.season_id into new_prev from public.seasons se
   where se.start_year < (select sc.start_year from public.seasons sc where sc.season_id = public.fpl_current_season_id())
     and exists (select 1 from public.fpl_player_gameweek_history hx where hx.season_id = se.season_id)
   order by se.start_year desc limit 1;
  if old_prev is distinct from new_prev then
    raise exception 'previous FPL season differs: old rule %, new rule % -- review before applying', old_prev, new_prev;
  end if;
end $$;
