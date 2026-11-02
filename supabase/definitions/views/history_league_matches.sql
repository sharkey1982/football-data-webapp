-- Live definition exported from the database (view history_league_matches).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.history_league_matches with (security_invoker=true) as
 SELECT s.league_id,
    s.season_id,
    se.start_year,
    s.match_id,
    s.match_date,
    s.team_id AS home_team_id,
    s.opponent_team_id AS away_team_id,
    s.goals_for AS home_goals,
    s.goals_against AS away_goals,
    (s.goals_for + s.goals_against) AS total_goals,
    abs((s.goals_for - s.goals_against)) AS margin
   FROM (team_match_snapshot s
     JOIN seasons se USING (season_id))
  WHERE (s.venue = 'H'::text);
