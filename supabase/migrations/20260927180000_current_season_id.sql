-- Single source of truth for "the current football season".
--
-- season_id is NOT chronological (14..35 = 1992/93..2013/14, 1..13 =
-- 2014/15..2026/27), so max(season_id) and hard-coded ids/labels ('2627',
-- 13) are wrong or break at the 2027/28 rollover. Everything that means
-- "this season" now asks current_season_id() (football) or
-- fpl_current_season_id() (FPL, data-driven, already existed).
--
-- A football season runs 1 July of start_year to 30 June of end_year: every
-- tracked competition finishes by early June and the earliest start is late
-- July (Scottish Premiership 2026/27 kicked off 31 July, the Carabao Cup
-- 1 August). FPL keeps its own August boundary in private.refresh_fpl().
-- See docs/season-rollover.md.

create or replace function public.season_id_for_date(p_date date)
returns bigint
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  -- The season whose 1 July - 30 June window contains p_date (null if no
  -- seasons row covers it).
  select s.season_id from public.seasons s
   where p_date >= make_date(s.start_year, 7, 1)
     and p_date <  make_date(s.start_year + 1, 7, 1)
   order by s.start_year desc
   limit 1
$function$;

create or replace function public.current_season_id()
returns bigint
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  -- The football season in play today. If next season's seasons row has not
  -- been added by 1 July, this stays on the latest season that has started
  -- (so feeds keep working on the old season) and check_model_integrity()
  -- fails 'season_rollover_ready' until the row is added.
  select coalesce(
    public.season_id_for_date(current_date),
    (select s.season_id from public.seasons s
      where make_date(s.start_year, 7, 1) <= current_date
      order by s.start_year desc limit 1))
$function$;

comment on function public.season_id_for_date(date) is
  'Season whose 1 July - 30 June window contains the date. See docs/season-rollover.md.';
comment on function public.current_season_id() is
  'The current football season (1 July boundary). Single source of truth; never use max(season_id) or a hard-coded id. See docs/season-rollover.md.';

grant execute on function public.season_id_for_date(date) to anon, authenticated, service_role;
grant execute on function public.current_season_id() to anon, authenticated, service_role;
