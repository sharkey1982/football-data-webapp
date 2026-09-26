-- Live definition exported from the database (view fpl_projection_frontend_feed).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_frontend_feed with (security_invoker=true) as
 SELECT pr.fixture_id,
    f.kickoff_date,
    pr.fpl_player_id,
    p.web_name,
    p.canonical_team_id AS team_id,
    p.element_type AS fpl_position,
    m.tactical_role,
    m.minutes_source,
    pr.model_version,
    pr.expected_minutes,
    pr.start_probability,
    pr.sub_appearance_probability,
    pr.expected_goals,
    pr.expected_assists,
    pr.clean_sheet_probability,
    pr.defensive_contribution_probability,
    pr.expected_bonus,
    pr.expected_fpl_points,
    pr.lineup_confidence,
    pr.generated_at
   FROM (((fpl_player_projections pr
     JOIN fixtures f ON ((f.fixture_id = pr.fixture_id)))
     JOIN fpl_players p ON (((p.season_id = pr.season_id) AND (p.fpl_player_id = pr.fpl_player_id))))
     LEFT JOIN fixture_player_expected_minutes_resolved m ON (((m.fixture_id = pr.fixture_id) AND (m.fpl_player_id = pr.fpl_player_id))))
  WHERE (pr.model_version = 'leaguewide_v4'::text);
