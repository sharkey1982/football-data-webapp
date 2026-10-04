-- ============================================================================
-- NFL modelling inputs (4 Oct 2026).
--
-- 1. More game fields from nflverse games.csv that the modelling needs: rest
--    days, starting QB ids, weather (temp, wind; null for roofed games),
--    and the prices on both sides of the spread and total.
-- 2. public.nfl_lab_games: every column of nfl.games for the Model Lab
--    scripts, service_role only (nothing on the site reads it).
-- ============================================================================

alter table nfl.games
  add column away_rest int,
  add column home_rest int,
  add column temp int,
  add column wind int,
  add column away_qb_id text,
  add column home_qb_id text,
  add column away_spread_odds int,
  add column home_spread_odds int,
  add column over_odds int,
  add column under_odds int;

create or replace function public.nfl_upsert_games(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.nfl_upsert_games(jsonb) from public, anon, authenticated;
grant execute on function public.nfl_upsert_games(jsonb) to service_role;

-- Model Lab read access: every game column with franchise codes. Private.
create view public.nfl_lab_games with (security_invoker = true) as
select g.*, hc.franchise as home_franchise, ac.franchise as away_franchise
from nfl.games g
join nfl.team_codes hc on hc.code = g.home_code
join nfl.team_codes ac on ac.code = g.away_code;
revoke all on public.nfl_lab_games from anon, authenticated;
grant select on public.nfl_lab_games to service_role;
comment on view public.nfl_lab_games is 'Model Lab only (service_role): every nfl.games column plus franchise codes. Not read by the site.';
