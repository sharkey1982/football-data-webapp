-- Live definition exported from the database (view fpl_projection_fixture_readiness).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_fixture_readiness with (security_invoker=true) as
 SELECT f.fixture_id,
    f.kickoff_date,
    f.home_team_id,
    f.away_team_id,
    f.predicted_home_goals,
    f.predicted_away_goals,
    ((f.predicted_home_goals IS NOT NULL) AND (f.predicted_away_goals IS NOT NULL)) AS has_team_xg,
    COALESCE(( SELECT count(*) AS count
           FROM fixture_lineup_predictions lp
          WHERE (lp.fixture_id = f.fixture_id)), (0)::bigint) AS lineup_sources,
    COALESCE(( SELECT count(*) AS count
           FROM (fixture_lineup_prediction_players lpp
             JOIN fixture_lineup_predictions lp ON ((lp.lineup_prediction_id = lpp.lineup_prediction_id)))
          WHERE (lp.fixture_id = f.fixture_id)), (0)::bigint) AS lineup_player_rows,
    COALESCE(( SELECT count(*) AS count
           FROM fpl_player_projections p
          WHERE ((p.fixture_id = f.fixture_id) AND (p.model_version = 'prototype_v3'::text))), (0)::bigint) AS projection_rows
   FROM (fixtures f
     JOIN leagues l ON ((l.league_id = f.league_id)))
  WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (l.code = 'E0'::text));
