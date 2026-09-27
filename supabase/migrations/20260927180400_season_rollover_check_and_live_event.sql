-- Season rollover self-check, and the live-event refresh scoped to one season.
--
-- 1. check_model_integrity() gains 'season_rollover_ready'
--    (docs/season-rollover.md):
--      failed  -- no seasons row covers today (current_season_id() is then
--                 stuck on last season), or FPL gameweeks whose deadline falls
--                 after their season's 30 June end are stored under that
--                 season: private.refresh_fpl() (August boundary) loaded the
--                 new FPL game in July and overwrote last season's rows.
--      warning -- from 1 May, next season's seasons row is still missing; or
--                 15 June - 31 July, the window in which FPL usually relaunches
--                 while private.refresh_fpl() still stamps the old season.
--    Verified before adding: today 13 covers 2026-09-27, and no gameweek has
--    a deadline past its season's end, so the check returns 'ok'.
--
-- 2. private.refresh_fpl_current_event() picked the current event as
--    `where is_current order by fpl_event_id desc`. After the rollover last
--    season's GW38 row keeps is_current = true (refresh_fpl only upserts the
--    new season's rows), so it would have kept picking event 38 and fetching
--    the NEW season's GW38 live data. Now scoped to fpl_current_season_id().
--    private.refresh_fpl() itself is not touched.

create or replace function pg_temp.anchored_replace(p_src text, p_anchor text, p_repl text, p_expect int default 1)
returns text language plpgsql as $f$
declare n int := (length(p_src) - length(replace(p_src, p_anchor, ''))) / length(p_anchor);
begin
  if n <> p_expect then raise exception 'anchor matched % time(s), expected %: %', n, p_expect, left(p_anchor, 80); end if;
  return replace(p_src, p_anchor, p_repl);
end $f$;

do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,',
    '  union all
  -- Season rollover (2026-09-27): see docs/season-rollover.md.
  select ''season_rollover_ready'',
    case when sr.cov is null or sr.fpl_ahead > 0 then ''failed''
         when sr.nxt is null and current_date >= make_date(sr.sy + 1, 5, 1) then ''warning''
         when current_date between make_date(extract(year from current_date)::int, 6, 15)
                               and make_date(extract(year from current_date)::int, 7, 31) then ''warning''
         else ''ok'' end,
    sr.fpl_ahead,
    case when sr.cov is null then ''No seasons row covers today, so current_season_id() is stuck on '' || sr.lbl || ''. Add next season''''s row (docs/season-rollover.md).''
         when sr.fpl_ahead > 0 then sr.fpl_ahead || '' FPL gameweek(s) with a deadline after their season ended are stored under the old season: private.refresh_fpl() loaded the new FPL game before 1 August. See docs/season-rollover.md.''
         when sr.nxt is null and current_date >= make_date(sr.sy + 1, 5, 1) then ''Next season ('' || (sr.sy + 1) || ''/'' || right((sr.sy + 2)::text, 2) || '') has no seasons row; add it before 1 July (docs/season-rollover.md).''
         when current_date between make_date(extract(year from current_date)::int, 6, 15)
                               and make_date(extract(year from current_date)::int, 7, 31)
           then ''Until 1 August private.refresh_fpl() stores FPL data under last season. Once FPL relaunches, pause cron jobs fpl-refresh-6-hourly and fpl-live-current-6-hourly until 1 August (docs/season-rollover.md).''
         else ''Current season '' || sr.lbl || '' is covered'' || case when sr.nxt is null then ''; next season''''s row is not needed until 1 May'' else '' and next season''''s row exists'' end || ''.'' end
  from (select c.cov, s.start_year sy, s.start_year || ''/'' || right(s.end_year::text, 2) lbl,
               (select n.season_id from public.seasons n where n.start_year = s.start_year + 1) nxt,
               (select count(*) from public.fpl_gameweeks g join public.seasons gs on gs.season_id = g.season_id
                 where g.deadline_time >= make_date(gs.start_year + 1, 7, 1)) fpl_ahead
          from (select public.season_id_for_date(current_date) cov) c
          join public.seasons s on s.season_id = public.current_season_id()) sr
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,');
  execute d;

  d := pg_get_functiondef('private.refresh_fpl_current_event()'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '  select fpl_event_id into ev from public.fpl_gameweeks where is_current order by fpl_event_id desc limit 1;',
    '  -- Scoped to the current FPL season: last season''s GW38 keeps is_current
  -- after the rollover (docs/season-rollover.md).
  select fpl_event_id into ev from public.fpl_gameweeks
   where is_current and season_id = public.fpl_current_season_id()
   order by fpl_event_id desc limit 1;');
  execute d;
end $mig$;
