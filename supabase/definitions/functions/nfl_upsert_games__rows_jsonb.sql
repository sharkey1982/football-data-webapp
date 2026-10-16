-- Live definition exported from the database (function nfl_upsert_games(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_upsert_games(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into nfl.games as g (game_id, season, game_type, week, gameday, gametime, kickoff_at,
    away_code, home_code, away_score, home_score, overtime, neutral_site, div_game,
    spread_line, total_line, away_moneyline, home_moneyline, roof, surface, stadium,
    away_qb_name, home_qb_name, away_coach, home_coach,
    away_rest, home_rest, temp, wind, away_qb_id, home_qb_id,
    away_spread_odds, home_spread_odds, over_odds, under_odds, imported_at)
  select r->>'game_id', (r->>'season')::int, r->>'game_type', (r->>'week')::int,
    (r->>'gameday')::date, nullif(r->>'gametime', ''),
    case when nullif(r->>'gametime', '') is null then null
         else ((r->>'gameday') || ' ' || (r->>'gametime'))::timestamp at time zone 'America/New_York' end,
    r->>'away_code', r->>'home_code', (r->>'away_score')::int, (r->>'home_score')::int,
    (r->>'overtime')::boolean, coalesce((r->>'neutral_site')::boolean, false), coalesce((r->>'div_game')::boolean, false),
    (r->>'spread_line')::numeric, (r->>'total_line')::numeric,
    (r->>'away_moneyline')::int, (r->>'home_moneyline')::int,
    r->>'roof', r->>'surface', r->>'stadium', r->>'away_qb_name', r->>'home_qb_name',
    r->>'away_coach', r->>'home_coach',
    (r->>'away_rest')::int, (r->>'home_rest')::int, (r->>'temp')::int, (r->>'wind')::int,
    r->>'away_qb_id', r->>'home_qb_id',
    (r->>'away_spread_odds')::int, (r->>'home_spread_odds')::int, (r->>'over_odds')::int, (r->>'under_odds')::int,
    now()
  from jsonb_array_elements(rows) r
  on conflict (game_id) do update set
    season = excluded.season, game_type = excluded.game_type, week = excluded.week,
    gameday = excluded.gameday, gametime = excluded.gametime, kickoff_at = excluded.kickoff_at,
    away_code = excluded.away_code, home_code = excluded.home_code,
    away_score = excluded.away_score, home_score = excluded.home_score, overtime = excluded.overtime,
    neutral_site = excluded.neutral_site, div_game = excluded.div_game,
    spread_line = excluded.spread_line, total_line = excluded.total_line,
    away_moneyline = excluded.away_moneyline, home_moneyline = excluded.home_moneyline,
    roof = excluded.roof, surface = excluded.surface, stadium = excluded.stadium,
    away_qb_name = excluded.away_qb_name, home_qb_name = excluded.home_qb_name,
    away_coach = excluded.away_coach, home_coach = excluded.home_coach,
    away_rest = excluded.away_rest, home_rest = excluded.home_rest, temp = excluded.temp, wind = excluded.wind,
    away_qb_id = excluded.away_qb_id, home_qb_id = excluded.home_qb_id,
    away_spread_odds = excluded.away_spread_odds, home_spread_odds = excluded.home_spread_odds,
    over_odds = excluded.over_odds, under_odds = excluded.under_odds,
    imported_at = now()
  where excluded.home_score is not null or g.home_score is null;
  get diagnostics n = row_count;
  return n;
end $function$
;
