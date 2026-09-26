-- Live definition exported from the database (view fpl_projection_v4_leaguewide_inputs).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_v4_leaguewide_inputs with (security_invoker=true) as
 SELECT m.fixture_id,
    m.team_id,
    m.fpl_player_id,
    m.expected_minutes,
    m.prob_starting_xi,
    m.prob_sub_appearance,
    m.availability_probability,
    m.tactical_role AS real_tactical_role,
    p.web_name,
    p.element_type,
    p.minutes AS season_minutes,
    COALESCE((((p.expected_goals / (NULLIF(p.minutes, 0))::numeric) * (90)::numeric) * (((p.goals_scored)::numeric + 6.0) / (NULLIF(p.expected_goals, (0)::numeric) + 6.0))), (0)::numeric) AS raw_xg90,
    COALESCE(((p.expected_assists / (NULLIF(p.minutes, 0))::numeric) * (90)::numeric), (0)::numeric) AS raw_xa90
   FROM ((fixture_player_expected_minutes_resolved_v3 m
     JOIN fpl_players p ON (((p.fpl_player_id = m.fpl_player_id) AND (p.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))))
     JOIN fixtures f ON ((f.fixture_id = m.fixture_id)))
  WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (f.predicted_home_goals IS NOT NULL) AND (f.predicted_away_goals IS NOT NULL));
