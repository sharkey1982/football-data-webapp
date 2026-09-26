-- Live definition exported from the database (view upcoming_broadcast_fixtures).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.upcoming_broadcast_fixtures as
 SELECT fb.broadcast_id,
    fb.market,
    fb.broadcaster,
    fb.channel,
    fb.streaming_service,
    fb.is_free_to_air,
    fb.is_subscription,
    fb.is_ppv,
    fb.watch_url,
    f.fixture_id,
    f.slug,
    f.kickoff_date,
    f.kickoff_time,
    f.league_id,
    l.code AS league_code,
    l.name AS league_name,
    co.name AS country_name,
    ht.team_id AS home_team_id,
    ht.display_name AS home_team_name,
    at.team_id AS away_team_id,
    at.display_name AS away_team_name,
    f.predicted_home_goals,
    f.predicted_away_goals
   FROM (((((fixture_broadcasts fb
     JOIN fixtures f ON ((f.fixture_id = fb.fixture_id)))
     JOIN leagues l ON ((l.league_id = f.league_id)))
     JOIN countries co ON ((co.country_id = l.country_id)))
     JOIN teams ht ON ((ht.team_id = f.home_team_id)))
     JOIN teams at ON ((at.team_id = f.away_team_id)))
  WHERE ((fb.status = 'confirmed_broadcast'::text) AND (f.kickoff_date >= CURRENT_DATE))
  ORDER BY f.kickoff_date, f.kickoff_time;
