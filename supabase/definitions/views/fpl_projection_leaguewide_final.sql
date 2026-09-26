-- Live definition exported from the database (view fpl_projection_leaguewide_final).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_leaguewide_final with (security_invoker=true) as
 SELECT p.fixture_id,
    p.team_id,
    p.fpl_player_id,
    p.web_name,
    p.element_type,
    p.real_tactical_role,
    p.expected_minutes,
    p.prob_starting_xi,
    p.prob_sub_appearance,
    p.expected_goals,
    p.expected_assists,
    p.clean_sheet_probability,
    p.defensive_contribution_probability,
    p.expected_bonus,
    p.xpts_appearance,
    p.xpts_goals,
    p.xpts_assists,
    p.xpts_clean_sheet,
    p.xpts_defensive_contribution,
    p.xpts_bonus,
    s.xpts_saves,
    s.xpts_goals_conceded,
    s.xpts_cards_own_goals,
    s.xpts_penalties,
    ((((((((((p.xpts_appearance + p.xpts_goals) + p.xpts_assists))::double precision + p.xpts_clean_sheet) + (p.xpts_defensive_contribution)::double precision) + (p.xpts_bonus)::double precision) + (s.xpts_saves)::double precision) + s.xpts_goals_conceded) + (s.xpts_cards_own_goals)::double precision) + (s.xpts_penalties)::double precision) AS expected_fpl_points
   FROM (fpl_projection_leaguewide_points p
     JOIN fpl_projection_secondary_scoring s ON (((s.fixture_id = p.fixture_id) AND (s.fpl_player_id = p.fpl_player_id))));
