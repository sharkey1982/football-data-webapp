-- Live definition exported from the database (view sf_match_events).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_match_events with (security_invoker=true) as
 SELECT e.fixture_id,
    e.seq,
    e.minute,
    e.type,
    e.side,
    e.player_id,
    p.name AS player,
    e.detail
   FROM ((((sf.match_events e
     JOIN sf.fixtures f ON ((f.id = e.fixture_id)))
     JOIN sf.rounds r ON (((r.season_id = f.season_id) AND (r.number = f.round))))
     JOIN sf.seasons s ON ((s.id = f.season_id)))
     LEFT JOIN sf.players p ON (((p.universe_id = s.universe_id) AND (p.id = e.player_id))))
  WHERE ((e.type <> ALL (ARRAY['shot'::text, 'kickoff'::text])) AND (now() >= sf.reveal_at(r.kickoff_at, e.minute)));
