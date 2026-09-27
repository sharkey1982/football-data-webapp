-- Read-only contract test for season ordering and division names by era.
-- Run with psql (or execute_sql) against the target database after
-- 20260927100000-20260927100300. Raises on the first broken expectation.
--
-- season_id is not in date order (1992/93-2013/14 are ids 14-35, after
-- 2026/27 = 13): everything "current / last / newest" must follow start_year.

do $season_contract$
declare
  latest_year integer;
  r record;
begin
  -- start_year is the unique order key.
  if exists (select start_year from public.seasons group by start_year having count(*) > 1) then
    raise exception 'seasons.start_year is not unique';
  end if;

  -- Helpers agree with start_year.
  if public.season_start_year((select season_id from public.seasons where label = '9293')) <> 1992 then
    raise exception 'season_start_year(9293) <> 1992';
  end if;
  if public.previous_season_id((select season_id from public.seasons where label = '1415'))
     is distinct from (select season_id from public.seasons where label = '1314') then
    raise exception 'previous_season_id(2014/15) is not 2013/14';
  end if;
  if public.earlier_season((select season_id from public.seasons where label = '1415'),
                           (select season_id from public.seasons where label = '9293'))
     is distinct from (select season_id from public.seasons where label = '9293') then
    raise exception 'earlier_season picks by id, not year';
  end if;
  if public.later_season((select season_id from public.seasons where label = '1415'),
                         (select season_id from public.seasons where label = '9293'))
     is distinct from (select season_id from public.seasons where label = '1415') then
    raise exception 'later_season picks by id, not year';
  end if;

  -- "Current" FPL season is the latest by year with gameweeks.
  select max(s.start_year) into latest_year
    from public.seasons s where exists (select 1 from public.fpl_gameweeks g where g.season_id = s.season_id);
  if public.season_start_year(public.fpl_current_season_id()) is distinct from latest_year then
    raise exception 'fpl_current_season_id is not the latest season by start_year';
  end if;

  -- Division names by era, at every boundary.
  for r in
    select * from (values
      ('E0', '9293', 'Premier League'),
      ('E1', '9293', 'First Division'),
      ('E1', '0304', 'First Division'),
      ('E1', '0405', 'Championship'),
      ('E2', '0304', 'Second Division'),
      ('E2', '0405', 'League One'),
      ('E3', '0304', 'Third Division'),
      ('E3', '0405', 'League Two'),
      ('EC', '9293', 'Football Conference'),
      ('EC', '0304', 'Football Conference'),
      ('EC', '0405', 'Conference National'),
      ('EC', '1415', 'Conference National'),
      ('EC', '1516', 'National League'),
      ('E1', '2627', 'Championship')
    ) v(code, label, expected)
  loop
    if public.league_name_for_season(
         (select league_id from public.leagues where code = r.code and competition_type = 'league'),
         (select season_id from public.seasons where label = r.label)) is distinct from r.expected then
      raise exception 'league_name_for_season(%, %) is not %', r.code, r.label, r.expected;
    end if;
  end loop;

  -- The current season's names are today's names for every league.
  if exists (
    select 1 from public.league_season_display_names d join public.leagues l using (league_id)
     where d.season_id = (select season_id from public.seasons order by start_year desc limit 1)
       and d.name <> l.name) then
    raise exception 'a current-season division name differs from leagues.name';
  end if;

  -- The site reads these as anon.
  if not has_table_privilege('anon', 'public.league_season_display_names', 'SELECT')
     or not has_table_privilege('anon', 'public.league_season_names', 'SELECT') then
    raise exception 'anon cannot read the division-name objects';
  end if;
end
$season_contract$;
