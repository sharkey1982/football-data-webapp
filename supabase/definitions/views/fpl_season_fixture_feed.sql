-- Live definition exported from the database (view fpl_season_fixture_feed).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_season_fixture_feed with (security_invoker=true) as
 SELECT f.fixture_id,
    f.season_id,
    f.matchweek,
    f.round,
    f.round_number,
    f.kickoff_date,
    f.kickoff_time,
    f.status,
    f.home_team_id,
    ht.canonical_name AS home_team,
    f.away_team_id,
    at.canonical_name AS away_team,
    f.predicted_home_goals,
    f.predicted_away_goals,
    f.predicted_at,
        CASE
            WHEN ((f.predicted_home_goals IS NOT NULL) AND (f.predicted_away_goals IS NOT NULL)) THEN true
            ELSE false
        END AS has_projection
   FROM ((fixtures f
     JOIN teams ht ON ((ht.team_id = f.home_team_id)))
     JOIN teams at ON ((at.team_id = f.away_team_id)))
  WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (f.league_id = ( SELECT leagues.league_id
           FROM leagues
          WHERE (leagues.code = 'E0'::text)
         LIMIT 1)));
