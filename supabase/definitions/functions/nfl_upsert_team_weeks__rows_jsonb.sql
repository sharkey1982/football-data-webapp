-- Live definition exported from the database (function nfl_upsert_team_weeks(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_upsert_team_weeks(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into nfl.team_weeks
  select (jsonb_populate_record(null::nfl.team_weeks, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict (game_id, team) do update set
    opponent = excluded.opponent, season = excluded.season, week = excluded.week, season_type = excluded.season_type,
    completions = excluded.completions, attempts = excluded.attempts, passing_yards = excluded.passing_yards,
    passing_tds = excluded.passing_tds, passing_interceptions = excluded.passing_interceptions,
    sacks_suffered = excluded.sacks_suffered, sack_yards_lost = excluded.sack_yards_lost,
    passing_first_downs = excluded.passing_first_downs, passing_epa = excluded.passing_epa,
    carries = excluded.carries, rushing_yards = excluded.rushing_yards, rushing_tds = excluded.rushing_tds,
    rushing_first_downs = excluded.rushing_first_downs, rushing_epa = excluded.rushing_epa,
    fumbles_lost = excluded.fumbles_lost, special_teams_tds = excluded.special_teams_tds,
    def_sacks = excluded.def_sacks, def_interceptions = excluded.def_interceptions, def_tds = excluded.def_tds,
    def_safeties = excluded.def_safeties, fumble_recovery_opp = excluded.fumble_recovery_opp,
    def_blocks = excluded.def_blocks, penalties = excluded.penalties, penalty_yards = excluded.penalty_yards,
    fg_made = excluded.fg_made, fg_att = excluded.fg_att, pat_made = excluded.pat_made, pat_att = excluded.pat_att,
    imported_at = now();
  get diagnostics n = row_count;
  return n;
end $function$
;
