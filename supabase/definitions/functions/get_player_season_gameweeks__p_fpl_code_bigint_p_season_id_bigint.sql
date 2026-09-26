-- Live definition exported from the database (function get_player_season_gameweeks(p_fpl_code bigint, p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_player_season_gameweeks(p_fpl_code bigint, p_season_id bigint)
 RETURNS TABLE(gameweek integer, opponent text, was_home boolean, minutes integer, total_points integer, goals_scored integer, assists integer, clean_sheets integer, goals_conceded integer, bonus integer, saves integer, yellow_cards integer, red_cards integer, own_goals integer, penalties_missed integer, penalties_saved integer, defensive_contribution integer, price integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    g.fpl_event_id::integer, opp.display_name,
    case when ff.fpl_home_team_id = p.fpl_team_id then true else false end,
    g.minutes, g.total_points, g.goals_scored, g.assists, g.clean_sheets,
    g.goals_conceded, g.bonus, g.saves, g.yellow_cards, g.red_cards,
    g.own_goals, g.penalties_missed, g.penalties_saved,
    coalesce((g.source_payload->'stats'->>'defensive_contribution')::int, 0),
    null::int
  from public.fpl_players p
  join public.fpl_player_gameweeks g
    on g.fpl_player_id = p.fpl_player_id and g.season_id = p.season_id
  join public.fpl_fixtures ff
    on ff.fpl_fixture_id = g.fpl_fixture_id and ff.season_id = g.season_id
  left join public.fpl_teams oppt
    on oppt.fpl_team_id = case when ff.fpl_home_team_id = p.fpl_team_id
                               then ff.fpl_away_team_id else ff.fpl_home_team_id end
   and oppt.season_id = g.season_id
  left join public.teams opp on opp.team_id = oppt.canonical_team_id
  where p.fpl_code = p_fpl_code and p.season_id = p_season_id

  union all

  select
    h.gameweek, null::text, h.was_home,
    h.minutes, h.total_points, h.goals_scored, h.assists, h.clean_sheets,
    h.goals_conceded, h.bonus, h.saves, h.yellow_cards, h.red_cards,
    0, 0, 0, 0, h.value
  from public.fpl_player_gameweek_history h
  where h.fpl_code = p_fpl_code and h.season_id = p_season_id

  order by 1;
$function$
;
