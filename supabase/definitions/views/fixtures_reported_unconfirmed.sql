-- Live definition exported from the database (view fixtures_reported_unconfirmed).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixtures_reported_unconfirmed with (security_invoker=true) as
 SELECT fixture_id,
    slug,
    league_id,
    season_id,
    kickoff_date,
    home_team_id,
    away_team_id,
    reported_home_goals,
    reported_away_goals,
    reported_at,
    reported_source
   FROM fixtures f
  WHERE ((status = 'played'::text) AND (reported_home_goals IS NOT NULL) AND (reported_away_goals IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM matches m
          WHERE ((m.league_id = f.league_id) AND (m.season_id = f.season_id) AND (m.home_team_id = f.home_team_id) AND (m.away_team_id = f.away_team_id) AND ((m.match_date >= (f.kickoff_date - 3)) AND (m.match_date <= (f.kickoff_date + 3))) AND (m.full_time_home_goals IS NOT NULL))))));
