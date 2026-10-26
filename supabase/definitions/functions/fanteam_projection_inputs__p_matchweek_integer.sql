-- Live definition exported from the database (function fanteam_projection_inputs(p_matchweek integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fanteam_projection_inputs(p_matchweek integer)
 RETURNS TABLE(fixture_id bigint, matchweek integer, kickoff_date date, kickoff_time text, fpl_player_id integer, fpl_code integer, web_name text, first_name text, second_name text, element_type integer, team_id integer, team_name text, opponent_name text, is_home boolean, now_cost integer, status text, start_probability numeric, sub_appearance_probability numeric, expected_minutes numeric, expected_goals numeric, expected_assists numeric, expected_saves numeric, xpts_clean_sheet numeric, xpts_goals_conceded numeric, xpts_penalties numeric, xpts_cards_own_goals numeric, team_goals numeric, opp_goals numeric, p_off_before_60 numeric, p_off_60_84 numeric, p_full numeric, generated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select pr.fixture_id::bigint, f.matchweek::int, f.kickoff_date::date, f.kickoff_time::text,
         pr.fpl_player_id::int, p.fpl_code::int, p.web_name::text, p.first_name::text, p.second_name::text,
         p.element_type::int, p.canonical_team_id::int, t.canonical_name::text, o.canonical_name::text,
         p.canonical_team_id = f.home_team_id,
         p.now_cost::int, p.status::text,
         least(1, greatest(0, pr.start_probability))::numeric,
         least(greatest(0, 1 - least(1, greatest(0, pr.start_probability))), greatest(0, pr.sub_appearance_probability))::numeric,
         pr.expected_minutes::numeric,
         pr.expected_goals::numeric, pr.expected_assists::numeric, pr.expected_saves::numeric,
         pr.xpts_clean_sheet::numeric, pr.xpts_goals_conceded::numeric, pr.xpts_penalties::numeric, pr.xpts_cards_own_goals::numeric,
         (case when p.canonical_team_id = f.home_team_id
               then coalesce(f.market_home_goals, f.predicted_home_goals)
               else coalesce(f.market_away_goals, f.predicted_away_goals) end)::numeric,
         (case when p.canonical_team_id = f.home_team_id
               then coalesce(f.market_away_goals, f.predicted_away_goals)
               else coalesce(f.market_home_goals, f.predicted_home_goals) end)::numeric,
         eb.p_off_before_60::numeric, eb.p_off_60_84::numeric, eb.p_full::numeric,
         pr.generated_at
  from public.fpl_player_projections pr
  join public.fixtures f on f.fixture_id = pr.fixture_id
  join public.fpl_players p on p.season_id = pr.season_id and p.fpl_player_id = pr.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  left join public.teams o on o.team_id = case when p.canonical_team_id = f.home_team_id then f.away_team_id else f.home_team_id end
  left join public.fpl_player_exit_bands eb on eb.season_id = pr.season_id and eb.fpl_player_id = pr.fpl_player_id
  where pr.model_version = 'leaguewide_v6'
    and f.league_id = 1
    and f.season_id = public.fpl_current_season_id()
    and f.matchweek = p_matchweek
$function$
;
