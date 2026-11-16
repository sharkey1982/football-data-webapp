-- Live definition exported from the database (function nfl_upsert_player_snaps(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_upsert_player_snaps(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into nfl.player_snaps
  select (jsonb_populate_record(null::nfl.player_snaps, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict (game_id, pfr_player_id) do update set
    player_id = excluded.player_id, player_name = excluded.player_name, season = excluded.season,
    week = excluded.week, game_type = excluded.game_type, team = excluded.team, opponent = excluded.opponent,
    position = excluded.position, offense_snaps = excluded.offense_snaps, offense_pct = excluded.offense_pct,
    defense_snaps = excluded.defense_snaps, defense_pct = excluded.defense_pct,
    st_snaps = excluded.st_snaps, st_pct = excluded.st_pct, imported_at = now();
  get diagnostics n = row_count;
  return n;
end $function$
;
