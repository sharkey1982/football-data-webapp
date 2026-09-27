-- Fixture feeds follow the current season instead of '2627' / '-2026'.
--
-- Before: refresh_fixture_feeds(), refresh_feed_nearest_date() and
-- refresh_national_league_fixtures() looked the season up by label '2627',
-- and the fixturedownload.com URLs ended '-2026'. At the 2027/28 rollover
-- they would have kept refreshing 2026/27 (and never loaded 2027/28).
--
-- After:
--   * season = public.current_season_id() (1 July boundary); feed URLs are
--     built from its start_year.
--   * refresh_fixture_feeds(): a league with no fixtures yet for the current
--     season gets its whole list inserted once via refresh_feed_nearest_date()
--     (the main matcher only updates existing rows, so E0-E3, D1 and the UEFA
--     competitions previously needed a manual insert each summer).
--   * refresh_fixture_feeds(): a 404 before 1 October of the season's start
--     year means "not published yet" (UEFA league-phase feeds appear after the
--     late-August draw) and is skipped and noted on the run, not a failure of
--     every feed. Later in the season a 404 fails as before.
--   * refresh_national_league_fixtures(): rows dated outside the current
--     season's 1 July - 30 June window are ignored, so next season's list
--     shown early on the source page cannot be stored as this season.
--
-- Edited in place with anchored replacements (each anchor asserted).
-- Dry-run: begin; <this>; select the new definitions; rollback -- all
-- anchors matched; no data is changed by this migration.

create or replace function pg_temp.anchored_replace(p_src text, p_anchor text, p_repl text, p_expect int default 1)
returns text language plpgsql as $f$
declare n int := (length(p_src) - length(replace(p_src, p_anchor, ''))) / length(p_anchor);
begin
  if n <> p_expect then raise exception 'anchor matched % time(s), expected %: %', n, p_expect, left(p_anchor, 80); end if;
  return replace(p_src, p_anchor, p_repl);
end $f$;

do $mig$
declare d text; n int;
begin
  -- refresh_fixture_feeds -----------------------------------------------------
  d := pg_get_functiondef('public.refresh_fixture_feeds()'::regprocedure);
  d := pg_temp.anchored_replace(d, 'declare v_run_id bigint;',
    'declare v_year int; v_skipped text[] := ''{}''; v_run_id bigint;');
  d := pg_temp.anchored_replace(d,
    ' select season_id into v_season_id from public.seasons where label=''2627'' limit 1;',
    ' -- Current season (docs/season-rollover.md); feed URLs carry its start year.
 v_season_id := public.current_season_id();
 select start_year into v_year from public.seasons where season_id = v_season_id;');
  n := (select count(*) from regexp_matches(d, '''(https://fixturedownload\.com/feed/json/[a-z0-9-]+-)2026''', 'g'));
  if n <> 11 then raise exception 'expected 11 feed URLs ending -2026, found %', n; end if;
  d := regexp_replace(d, '''(https://fixturedownload\.com/feed/json/[a-z0-9-]+-)2026''', '''\1'' || v_year', 'g');
  d := pg_temp.anchored_replace(d,
    '  if v_http_status<>200 then raise exception ''Feed % returned HTTP %'',v_code,v_http_status; end if;',
    '  -- Next season''s feed only exists once its fixtures are published (UEFA:
  -- after the late-August draw). Until 1 October a 404 is skipped and noted
  -- on the run; after that it is an error again.
  if v_http_status=404 and current_date < make_date(v_year,10,1) then v_skipped:=v_skipped||v_code; continue; end if;
  if v_http_status<>200 then raise exception ''Feed % returned HTTP %'',v_code,v_http_status; end if;');
  d := pg_temp.anchored_replace(d,
    '  v_json:=v_body::jsonb; v_count:=jsonb_array_length(v_json); v_seen:=v_seen+v_count;',
    '  v_json:=v_body::jsonb; v_count:=jsonb_array_length(v_json); v_seen:=v_seen+v_count;
  -- New season: no fixtures for this league yet, so insert the whole list
  -- once (the matcher below only updates existing rows).
  if not exists (select 1 from public.fixtures where league_id=v_league_id and season_id=v_season_id) then
   perform public.refresh_feed_nearest_date(v_code, v_url);
  end if;');
  d := pg_temp.anchored_replace(d,
    'update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status=''success'' where refresh_run_id=v_run_id;',
    'update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status=''success'',error_message=case when cardinality(v_skipped)>0 then ''Feeds not published yet (HTTP 404): ''||array_to_string(v_skipped,'', '') end where refresh_run_id=v_run_id;');
  execute d;

  -- refresh_feed_nearest_date --------------------------------------------------
  d := pg_get_functiondef('public.refresh_feed_nearest_date(text,text)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '  select season_id into v_season from public.seasons where label = ''2627'';',
    '  v_season := public.current_season_id();  -- docs/season-rollover.md');
  execute d;

  -- refresh_scottish_premiership_fixtures -------------------------------------
  d := pg_get_functiondef('public.refresh_scottish_premiership_fixtures()'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '''https://fixturedownload.com/feed/json/scottish-premiership-2026''',
    '''https://fixturedownload.com/feed/json/scottish-premiership-'' || public.season_start_year(public.current_season_id())');
  execute d;

  -- refresh_national_league_fixtures -------------------------------------------
  d := pg_get_functiondef('public.refresh_national_league_fixtures()'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '  v_unmapped text[]; v_dup_pairs int; v_problem text;',
    '  v_unmapped text[]; v_dup_pairs int; v_problem text; v_start int; v_out_of_season int := 0;');
  d := pg_temp.anchored_replace(d,
    '  select season_id into v_season from public.seasons where label = ''2627'';',
    '  v_season := public.current_season_id();  -- docs/season-rollover.md
  select start_year into v_start from public.seasons where season_id = v_season;');
  d := pg_temp.anchored_replace(d, '''EC league or 2026/27 season missing''', '''EC league or current season missing''');
  d := pg_temp.anchored_replace(d,
    '    if v_seen = 0 then raise exception ''no National League fixtures parsed; page layout may have changed''; end if;',
    '    if v_seen = 0 then raise exception ''no National League fixtures parsed; page layout may have changed''; end if;

    -- The page can list next season before 1 July (or last season after it):
    -- only rows dated inside the current season''s 1 July - 30 June window count.
    delete from _ec where ko_date < make_date(v_start, 7, 1) or ko_date >= make_date(v_start + 1, 7, 1);
    get diagnostics v_out_of_season = row_count;');
  d := pg_temp.anchored_replace(d, '''rows_seen'', v_seen, ''updated''',
    '''rows_seen'', v_seen, ''out_of_season'', v_out_of_season, ''updated''');
  execute d;
end $mig$;
