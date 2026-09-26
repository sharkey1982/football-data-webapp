-- Live definition exported from the database (view fpl_optimizer_candidate_feed_v2).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_optimizer_candidate_feed_v2 with (security_invoker=true) as
 SELECT p.fixture_id,
    f.matchweek,
    p.fpl_player_id,
    p.web_name,
    p.team_id,
    t.canonical_name AS team_name,
    p.fpl_position,
    fp.now_cost,
    ((fp.now_cost)::numeric / (10)::numeric) AS price_m,
    p.expected_minutes,
    p.start_probability,
    p.sub_appearance_probability,
    p.expected_fpl_points,
    p.lineup_confidence,
    p.model_version,
    p.generated_at,
    (p.team_id = f.home_team_id) AS is_home,
    COALESCE(opp.canonical_name, 'Unknown'::text) AS opponent_team_name
   FROM ((((fpl_projection_frontend_feed_v6 p
     JOIN fixtures f ON ((f.fixture_id = p.fixture_id)))
     LEFT JOIN fpl_players fp ON (((fp.fpl_player_id = p.fpl_player_id) AND (fp.season_id = f.season_id))))
     LEFT JOIN teams t ON ((t.team_id = p.team_id)))
     LEFT JOIN teams opp ON ((opp.team_id =
        CASE
            WHEN (p.team_id = f.home_team_id) THEN f.away_team_id
            ELSE f.home_team_id
        END)))
  WHERE (f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id));
