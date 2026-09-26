-- Live definition exported from the database (function import_fpl_season(p_season_id bigint, p_folder text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.import_fpl_season(p_season_id bigint, p_folder text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  raw_content text;
  header text[];
  n_bad int;
  n_total int;
  n_rows int;
  http_status int;
begin
  drop table if exists lines_t;
  drop table if exists staged_t;

  select status, content into http_status, raw_content
  from extensions.http_get('https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/' || p_folder || '/players_raw.csv');

  if http_status <> 200 then
    raise exception 'Fetch failed for % (HTTP %)', p_folder, http_status;
  end if;

  create temp table lines_t as
  select row_number() over () as ln, replace(l, E'\r', '') as l
  from (select unnest(string_to_array(raw_content, E'\n')) as l) s
  where length(trim(l)) > 0;

  select string_to_array(l, ',') into header from lines_t where ln = 1;

  if array_position(header,'code') is null or array_position(header,'cost_change_start') is null
     or array_position(header,'now_cost') is null or array_position(header,'total_points') is null then
    raise exception 'Required columns missing from % header', p_folder;
  end if;

  select count(*) into n_total from lines_t where ln > 1;
  select count(*) into n_bad from lines_t
  where ln > 1 and (array_length(string_to_array(l, ','), 1) <> array_length(header, 1) or l like '%"%');

  if n_bad > greatest(5, n_total / 100) then
    raise exception '% has % malformed row(s) of % -- that is a format change, not a quirk; aborting',
      p_folder, n_bad, n_total;
  end if;

  create temp table staged_t as
  select string_to_array(l, ',') as f from lines_t
  where ln > 1
    and array_length(string_to_array(l, ','), 1) = array_length(header, 1)
    and l not like '%"%';

  insert into public.fpl_player_season_totals (
    season_id, fpl_code, fpl_element_id, web_name, full_name, element_type,
    start_cost, end_cost, total_points, minutes, goals_scored, assists, clean_sheets,
    goals_conceded, bonus, bps, saves, yellow_cards, red_cards, penalties_missed,
    penalties_saved, own_goals, selected_by_percent
  )
  select p_season_id,
    (f[array_position(header,'code')])::bigint,
    (f[array_position(header,'id')])::int,
    f[array_position(header,'web_name')],
    trim(f[array_position(header,'first_name')] || ' ' || f[array_position(header,'second_name')]),
    (f[array_position(header,'element_type')])::int,
    (f[array_position(header,'now_cost')])::int - (f[array_position(header,'cost_change_start')])::int,
    (f[array_position(header,'now_cost')])::int,
    (f[array_position(header,'total_points')])::int,
    (f[array_position(header,'minutes')])::int,
    (f[array_position(header,'goals_scored')])::int,
    (f[array_position(header,'assists')])::int,
    (f[array_position(header,'clean_sheets')])::int,
    (f[array_position(header,'goals_conceded')])::int,
    (f[array_position(header,'bonus')])::int,
    (f[array_position(header,'bps')])::int,
    (f[array_position(header,'saves')])::int,
    (f[array_position(header,'yellow_cards')])::int,
    (f[array_position(header,'red_cards')])::int,
    (f[array_position(header,'penalties_missed')])::int,
    (f[array_position(header,'penalties_saved')])::int,
    (f[array_position(header,'own_goals')])::int,
    nullif(f[array_position(header,'selected_by_percent')], '')::numeric
  from staged_t
  where (f[array_position(header,'minutes')])::int > 0
  on conflict (season_id, fpl_code) do nothing;

  get diagnostics n_rows = row_count;

  insert into public.player_identity (fpl_code, canonical_name, first_seen_season_id, last_seen_season_id)
  select t.fpl_code, t.full_name, p_season_id, p_season_id
  from public.fpl_player_season_totals t
  where t.season_id = p_season_id
  on conflict (fpl_code) do update set
    first_seen_season_id = least(public.player_identity.first_seen_season_id, excluded.first_seen_season_id),
    last_seen_season_id = greatest(public.player_identity.last_seen_season_id, excluded.last_seen_season_id),
    updated_at = now();

  drop table if exists lines_t;
  drop table if exists staged_t;

  return jsonb_build_object(
    'season_id', p_season_id, 'folder', p_folder,
    'players_imported', n_rows, 'rows_skipped_malformed', n_bad
  );
end $function$
;
