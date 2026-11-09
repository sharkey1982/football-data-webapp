-- Live definition exported from the database (view fixture_changes_net).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_changes_net with (security_invoker=true) as
 WITH w AS (
         SELECT c.change_id,
            c.fixture_id,
            c.old_kickoff_date,
            c.new_kickoff_date,
            c.old_kickoff_time,
            c.new_kickoff_time,
            c.detected_at,
            row_number() OVER (PARTITION BY c.fixture_id ORDER BY c.detected_at, c.change_id) AS rn,
            count(*) OVER (PARTITION BY c.fixture_id) AS hops,
            max(c.detected_at) OVER (PARTITION BY c.fixture_id) AS last_detected
           FROM fixture_changes c
          WHERE (c.detected_at > (now() - '30 days'::interval))
        )
 SELECT f.fixture_id,
    f.slug,
    f.league_id,
    l.code AS league_code,
    l.name AS league_name,
    ht.display_name AS home_team_name,
    at.display_name AS away_team_name,
    w.old_kickoff_date AS was_date,
    w.old_kickoff_time AS was_time,
    f.kickoff_date AS now_date,
    f.kickoff_time AS now_time,
    f.status,
    (w.hops)::integer AS changes_logged,
    w.last_detected AS changed_at
   FROM ((((w
     JOIN fixtures f ON ((f.fixture_id = w.fixture_id)))
     JOIN leagues l ON ((l.league_id = f.league_id)))
     JOIN teams ht ON ((ht.team_id = f.home_team_id)))
     JOIN teams at ON ((at.team_id = f.away_team_id)))
  WHERE ((w.rn = 1) AND ((w.old_kickoff_date IS DISTINCT FROM f.kickoff_date) OR (w.old_kickoff_time IS DISTINCT FROM f.kickoff_time)));
