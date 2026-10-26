-- Live definition exported from the database (view sf_players).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_players with (security_invoker=true) as
 SELECT s.id AS season_id,
    p.universe_id,
    p.id AS player_id,
    p.name,
    p.club_id,
    c.short AS club,
    p."position",
    p.age,
    p.nationality,
    sf.price(s.id, p.id) AS price,
    sp.start_price,
    sc.attack,
    sc.creativity,
    sc.defence,
    sc.keeping,
    sc.discipline,
    st.available_from,
    ( SELECT COALESCE(sum(x.points), (0)::bigint) AS "coalesce"
           FROM ((sf.player_match_stats x
             JOIN sf.fixtures f ON ((f.id = x.fixture_id)))
             JOIN sf.rounds r ON (((r.season_id = f.season_id) AND (r.number = f.round))))
          WHERE ((x.player_id = p.id) AND (f.season_id = s.id) AND (now() >= sf.reveal_at(r.kickoff_at, 90)))) AS total_points,
    ( SELECT pr.x_points
           FROM sf.projections pr
          WHERE ((pr.season_id = s.id) AND (pr.player_id = p.id) AND (pr.round = ( SELECT min(r.number) AS min
                   FROM sf.rounds r
                  WHERE ((r.season_id = s.id) AND (r.state <> 'final'::text)))))) AS next_x_points
   FROM (((((sf.players p
     JOIN sf.seasons s ON ((s.universe_id = p.universe_id)))
     JOIN sf.clubs c ON (((c.universe_id = p.universe_id) AND (c.id = p.club_id))))
     LEFT JOIN sf.season_players sp ON (((sp.season_id = s.id) AND (sp.player_id = p.id))))
     LEFT JOIN sf.scouting sc ON (((sc.season_id = s.id) AND (sc.player_id = p.id))))
     LEFT JOIN sf.player_status st ON (((st.season_id = s.id) AND (st.player_id = p.id))))
  WHERE ((p.identity_category = 'original'::text) OR sf.identity_approved(p.provenance_id));
