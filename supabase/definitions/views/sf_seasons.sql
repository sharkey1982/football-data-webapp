-- Live definition exported from the database (view sf_seasons).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_seasons with (security_invoker=true) as
 SELECT s.id AS season_id,
    s.universe_id,
    u.name AS universe,
    s.number,
    s.state,
    s.rules_version,
    s.scoring_version,
    s.shield_winner,
    ( SELECT min(r.number) AS min
           FROM sf.rounds r
          WHERE ((r.season_id = s.id) AND (r.state <> 'final'::text))) AS current_round,
    ( SELECT r.number
           FROM sf.rounds r
          WHERE ((r.season_id = s.id) AND (r.state = 'open'::text))
          ORDER BY r.number
         LIMIT 1) AS open_round,
    u.is_test
   FROM (sf.seasons s
     JOIN sf.universes u ON ((u.id = s.universe_id)));
