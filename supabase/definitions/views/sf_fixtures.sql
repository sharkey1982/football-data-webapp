-- Live definition exported from the database (view sf_fixtures).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_fixtures with (security_invoker=true) as
 SELECT f.id AS fixture_id,
    f.season_id,
    f.round,
    f.kind,
    f.home_id,
    h.short AS home,
    f.away_id,
    a.short AS away,
    r.kickoff_at,
        CASE
            WHEN ((f.state = 'final'::text) AND (now() >= r.kickoff_at)) THEN
            CASE
                WHEN (now() >= sf.reveal_at(r.kickoff_at, 90)) THEN 'full_time'::text
                ELSE 'live'::text
            END
            ELSE 'scheduled'::text
        END AS status,
    (( SELECT count(*) AS count
           FROM sf.match_events e
          WHERE ((e.fixture_id = f.id) AND (e.type = ANY (ARRAY['goal'::text, 'pen_goal'::text, 'own_goal'::text])) AND (e.side = 'home'::text) AND (now() >= sf.reveal_at(r.kickoff_at, e.minute)))))::integer AS home_goals,
    (( SELECT count(*) AS count
           FROM sf.match_events e
          WHERE ((e.fixture_id = f.id) AND (e.type = ANY (ARRAY['goal'::text, 'pen_goal'::text, 'own_goal'::text])) AND (e.side = 'away'::text) AND (now() >= sf.reveal_at(r.kickoff_at, e.minute)))))::integer AS away_goals,
        CASE
            WHEN (now() >= sf.reveal_at(r.kickoff_at, 90)) THEN mr.shootout
            ELSE NULL::jsonb
        END AS shootout
   FROM (((((sf.fixtures f
     JOIN sf.rounds r ON (((r.season_id = f.season_id) AND (r.number = f.round))))
     JOIN sf.seasons s ON ((s.id = f.season_id)))
     JOIN sf.clubs h ON (((h.universe_id = s.universe_id) AND (h.id = f.home_id))))
     JOIN sf.clubs a ON (((a.universe_id = s.universe_id) AND (a.id = f.away_id))))
     LEFT JOIN sf.match_results mr ON ((mr.fixture_id = f.id)));
