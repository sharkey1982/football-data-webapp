-- Live definition exported from the database (function get_player_gameweek_breakdown(p_fpl_player_id bigint, p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_player_gameweek_breakdown(p_fpl_player_id bigint, p_season_id bigint DEFAULT 13)
 RETURNS TABLE(gameweek integer, opponent text, was_home boolean, kickoff_date date, minutes integer, total_points integer, goals_scored integer, assists integer, clean_sheets integer, goals_conceded integer, bonus integer, bps integer, saves integer, yellow_cards integer, red_cards integer, own_goals integer, penalties_missed integer, penalties_saved integer, defensive_contribution integer, projected_points numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    g.fpl_event_id::integer,
    opp.display_name,
    case when ff.fpl_home_team_id = p.fpl_team_id then true else false end,
    f.kickoff_date,
    g.minutes, g.total_points, g.goals_scored, g.assists, g.clean_sheets,
    g.goals_conceded, g.bonus, g.bps, g.saves, g.yellow_cards, g.red_cards,
    g.own_goals, g.penalties_missed, g.penalties_saved,
    coalesce((g.source_payload->'stats'->>'defensive_contribution')::int, 0),
    (
      select round(pr.expected_fpl_points::numeric, 1)
      from public.fpl_player_projections pr
      where pr.fixture_id = f.fixture_id
        and pr.fpl_player_id = g.fpl_player_id
        and pr.model_version = 'leaguewide_v6'
        and pr.generated_at < (f.kickoff_date::timestamp + coalesce(f.kickoff_time, '00:00:00'::time)::interval)
      order by pr.generated_at desc
      limit 1
    )
  from public.fpl_player_gameweeks g
  join public.fpl_players p
    on p.fpl_player_id = g.fpl_player_id and p.season_id = g.season_id
  join public.fpl_fixtures ff
    on ff.fpl_fixture_id = g.fpl_fixture_id and ff.season_id = g.season_id
  left join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
  left join public.fpl_teams oppt
    on oppt.fpl_team_id = case when ff.fpl_home_team_id = p.fpl_team_id
                               then ff.fpl_away_team_id else ff.fpl_home_team_id end
   and oppt.season_id = g.season_id
  left join public.teams opp on opp.team_id = oppt.canonical_team_id
  where g.fpl_player_id = p_fpl_player_id and g.season_id = p_season_id
  order by g.fpl_event_id;
$function$
;
