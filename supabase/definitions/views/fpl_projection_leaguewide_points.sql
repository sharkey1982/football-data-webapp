-- Live definition exported from the database (view fpl_projection_leaguewide_points).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_leaguewide_points with (security_invoker=true) as
 SELECT a.fixture_id,
    a.team_id,
    a.fpl_player_id,
    p.web_name,
    a.element_type,
    a.real_tactical_role,
    a.expected_minutes,
    a.prob_starting_xi,
    a.prob_sub_appearance,
    a.expected_goals,
    a.expected_assists,
        CASE
            WHEN (a.team_id = f.home_team_id) THEN exp((- f.predicted_away_goals))
            ELSE exp((- f.predicted_home_goals))
        END AS clean_sheet_probability,
    COALESCE(dc.defensive_contribution_probability, (0)::numeric) AS defensive_contribution_probability,
    (0)::numeric AS expected_bonus,
    ((a.prob_starting_xi * (2)::numeric) + a.prob_sub_appearance) AS xpts_appearance,
    (a.expected_goals * (
        CASE a.element_type
            WHEN 1 THEN 10
            WHEN 2 THEN 6
            WHEN 3 THEN 5
            ELSE 4
        END)::numeric) AS xpts_goals,
    (a.expected_assists * (3)::numeric) AS xpts_assists,
    (((
        CASE
            WHEN (a.element_type = ANY (ARRAY[1, 2])) THEN 4
            WHEN (a.element_type = 3) THEN 1
            ELSE 0
        END)::double precision *
        CASE
            WHEN (a.team_id = f.home_team_id) THEN exp((- f.predicted_away_goals))
            ELSE exp((- f.predicted_home_goals))
        END) * (a.prob_starting_xi)::double precision) AS xpts_clean_sheet,
    (COALESCE(dc.defensive_contribution_probability, (0)::numeric) * (2)::numeric) AS xpts_defensive_contribution,
    (0)::numeric AS xpts_bonus
   FROM (((fpl_projection_leaguewide_allocation_v2 a
     JOIN fpl_players p ON (((p.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (p.fpl_player_id = a.fpl_player_id))))
     JOIN fixtures f ON ((f.fixture_id = a.fixture_id)))
     LEFT JOIN fpl_defensive_contribution_projection_leaguewide dc ON (((dc.fixture_id = a.fixture_id) AND (dc.fpl_player_id = a.fpl_player_id))));
