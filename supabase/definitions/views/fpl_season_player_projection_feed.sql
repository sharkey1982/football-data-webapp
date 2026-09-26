-- Live definition exported from the database (view fpl_season_player_projection_feed).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_season_player_projection_feed with (security_invoker=true) as
 SELECT pr.fixture_id,
    f.matchweek,
    f.kickoff_date,
    COALESCE(fp.canonical_team_id, (fp.fpl_team_id)::bigint) AS team_id,
    fp.web_name,
    pr.fpl_player_id,
    fp.element_type AS fpl_position,
    tc.tactical_role,
    pr.expected_minutes,
    pr.start_probability,
    pr.sub_appearance_probability,
    NULL::numeric AS shrunk_xg90,
    NULL::numeric AS shrunk_xa90,
    pr.expected_goals,
    pr.expected_assists,
    pr.clean_sheet_probability,
    pr.defensive_contribution_probability,
    pr.expected_bonus AS experimental_expected_bonus
   FROM (((fpl_player_projections pr
     JOIN fixtures f ON ((f.fixture_id = pr.fixture_id)))
     JOIN fpl_players fp ON (((fp.season_id = pr.season_id) AND (fp.fpl_player_id = pr.fpl_player_id))))
     LEFT JOIN fixture_player_tactical_consensus tc ON (((tc.fixture_id = pr.fixture_id) AND (tc.fpl_player_id = pr.fpl_player_id))))
  WHERE ((pr.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (pr.model_version = 'leaguewide_v6'::text));
