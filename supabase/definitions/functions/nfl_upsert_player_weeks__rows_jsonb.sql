-- Live definition exported from the database (function nfl_upsert_player_weeks(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_upsert_player_weeks(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into nfl.player_weeks as w
  select (jsonb_populate_record(null::nfl.player_weeks, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict (player_id, game_id) do update set
    season = excluded.season, week = excluded.week, season_type = excluded.season_type,
    team = excluded.team, opponent = excluded.opponent, position = excluded.position,
    completions = excluded.completions, attempts = excluded.attempts, passing_yards = excluded.passing_yards,
    passing_tds = excluded.passing_tds, interceptions = excluded.interceptions, sacks = excluded.sacks,
    passing_2pt = excluded.passing_2pt, carries = excluded.carries, rushing_yards = excluded.rushing_yards,
    rushing_tds = excluded.rushing_tds, rushing_2pt = excluded.rushing_2pt, receptions = excluded.receptions,
    targets = excluded.targets, receiving_yards = excluded.receiving_yards, receiving_tds = excluded.receiving_tds,
    receiving_2pt = excluded.receiving_2pt, fumbles_lost = excluded.fumbles_lost,
    special_teams_tds = excluded.special_teams_tds, target_share = excluded.target_share,
    air_yards_share = excluded.air_yards_share, wopr = excluded.wopr,
    fg_made_0_39 = excluded.fg_made_0_39, fg_made_40_49 = excluded.fg_made_40_49,
    fg_made_50_plus = excluded.fg_made_50_plus, fg_att = excluded.fg_att, fg_missed = excluded.fg_missed,
    pat_made = excluded.pat_made, pat_missed = excluded.pat_missed,
    src_points_std = excluded.src_points_std, src_points_ppr = excluded.src_points_ppr, imported_at = now();
  get diagnostics n = row_count;
  return n;
end $function$
;
