-- Live definition exported from the database (function import_fpl_gameweeks(p_season_id bigint, p_folder text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.import_fpl_gameweeks(p_season_id bigint, p_folder text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  raw_content text;
  header text[];
  http_status int;
  n_total int;
  n_bad int;
  n_rows int;
  n_unmatched int;
begin
  if not exists (select 1 from public.fpl_player_season_totals where season_id = p_season_id) then
    raise exception 'Season % has no player totals; import those first so elements can resolve to codes', p_season_id;
  end if;

  drop table if exists gw_lines;
  drop table if exists gw_staged;

  select status, content into http_status, raw_content
  from extensions.http_get('https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/' || p_folder || '/gws/merged_gw.csv');
  if http_status <> 200 then
    raise exception 'Fetch failed for %/gws/merged_gw.csv (HTTP %)', p_folder, http_status;
  end if;

  create temp table gw_lines as
  select row_number() over () as ln, replace(l, E'\r', '') as l
  from (select unnest(string_to_array(raw_content, E'\n')) as l) s
  where length(trim(l)) > 0;

  select string_to_array(l, ',') into header from gw_lines where ln = 1;

  if array_position(header,'element') is null or array_position(header,'round') is null
     or array_position(header,'fixture') is null or array_position(header,'total_points') is null then
    raise exception 'Required columns missing from %/gws header', p_folder;
  end if;

  select count(*) into n_total from gw_lines where ln > 1;
  select count(*) into n_bad from gw_lines
  where ln > 1 and (array_length(string_to_array(l, ','), 1) <> array_length(header, 1) or l like '%"%');

  if n_bad > greatest(5, n_total / 100) then
    raise exception '%/gws has % malformed row(s) of % -- format change, not a quirk; aborting', p_folder, n_bad, n_total;
  end if;

  create temp table gw_staged as
  select string_to_array(l, ',') as f from gw_lines
  where ln > 1
    and array_length(string_to_array(l, ','), 1) = array_length(header, 1)
    and l not like '%"%';

  insert into public.fpl_player_gameweek_history (
    season_id, fpl_code, gameweek, fixture_id, opponent_team_num, was_home, minutes,
    total_points, starts, goals_scored, assists, clean_sheets, goals_conceded, bonus, bps,
    saves, yellow_cards, red_cards, value, selected, transfers_in, transfers_out,
    expected_goals, expected_assists
  )
  select p_season_id, tot.fpl_code,
    (f[array_position(header,'round')])::int,
    (f[array_position(header,'fixture')])::int,
    nullif(f[array_position(header,'opponent_team')],'')::int,
    lower(f[array_position(header,'was_home')]) = 'true',
    (f[array_position(header,'minutes')])::int,
    (f[array_position(header,'total_points')])::int,
    coalesce(nullif(f[array_position(header,'starts')],'')::int, 0),
    (f[array_position(header,'goals_scored')])::int,
    (f[array_position(header,'assists')])::int,
    (f[array_position(header,'clean_sheets')])::int,
    (f[array_position(header,'goals_conceded')])::int,
    (f[array_position(header,'bonus')])::int,
    (f[array_position(header,'bps')])::int,
    (f[array_position(header,'saves')])::int,
    (f[array_position(header,'yellow_cards')])::int,
    (f[array_position(header,'red_cards')])::int,
    nullif(f[array_position(header,'value')],'')::int,
    nullif(f[array_position(header,'selected')],'')::bigint,
    nullif(f[array_position(header,'transfers_in')],'')::bigint,
    nullif(f[array_position(header,'transfers_out')],'')::bigint,
    nullif(f[array_position(header,'expected_goals')],'')::numeric,
    nullif(f[array_position(header,'expected_assists')],'')::numeric
  from gw_staged g
  join public.fpl_player_season_totals tot
    on tot.season_id = p_season_id
   and tot.fpl_element_id = (g.f[array_position(header,'element')])::int
  on conflict (season_id, fpl_code, gameweek, fixture_id) do nothing;

  get diagnostics n_rows = row_count;

  select count(*) into n_unmatched
  from gw_staged g
  where not exists (
    select 1 from public.fpl_player_season_totals tot
    where tot.season_id = p_season_id
      and tot.fpl_element_id = (g.f[array_position(header,'element')])::int
  );

  drop table if exists gw_lines;
  drop table if exists gw_staged;

  return jsonb_build_object(
    'season_id', p_season_id, 'folder', p_folder,
    'rows_imported', n_rows, 'rows_skipped_malformed', n_bad,
    'rows_unmatched_element', n_unmatched
  );
end $function$
;
