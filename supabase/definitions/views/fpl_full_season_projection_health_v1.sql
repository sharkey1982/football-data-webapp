-- Live definition exported from the database (view fpl_full_season_projection_health_v1).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_full_season_projection_health_v1 with (security_invoker=true) as
 WITH fx AS (
         SELECT fixtures.matchweek,
            count(*) AS fixtures,
            count(*) FILTER (WHERE ((fixtures.predicted_home_goals IS NOT NULL) AND (fixtures.predicted_away_goals IS NOT NULL))) AS team_predictions
           FROM fixtures
          WHERE ((fixtures.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (fixtures.league_id = 1))
          GROUP BY fixtures.matchweek
        ), pr AS (
         SELECT f.matchweek,
            count(*) AS player_projection_rows,
            count(DISTINCT p.fixture_id) AS projected_fixtures
           FROM (fpl_player_projections p
             JOIN fixtures f ON ((f.fixture_id = p.fixture_id)))
          WHERE ((p.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (p.model_version = 'leaguewide_v6'::text) AND (f.league_id = 1))
          GROUP BY f.matchweek
        )
 SELECT fx.matchweek,
    fx.fixtures,
    fx.team_predictions,
    COALESCE(pr.projected_fixtures, (0)::bigint) AS projected_fixtures,
    COALESCE(pr.player_projection_rows, (0)::bigint) AS player_projection_rows,
    (COALESCE(pr.projected_fixtures, (0)::bigint) = fx.fixtures) AS full_player_coverage
   FROM (fx
     LEFT JOIN pr USING (matchweek))
  ORDER BY fx.matchweek;
