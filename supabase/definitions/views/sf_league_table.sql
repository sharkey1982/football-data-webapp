-- Live definition exported from the database (view sf_league_table).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_league_table with (security_invoker=true) as
 WITH res AS (
         SELECT f.season_id,
            f.home_id AS club,
            mr.home_goals AS gf,
            mr.away_goals AS ga
           FROM ((sf.fixtures f
             JOIN sf.match_results mr ON ((mr.fixture_id = f.id)))
             JOIN sf.rounds r ON (((r.season_id = f.season_id) AND (r.number = f.round))))
          WHERE ((f.kind = 'league'::text) AND (now() >= sf.reveal_at(r.kickoff_at, 90)))
        UNION ALL
         SELECT f.season_id,
            f.away_id,
            mr.away_goals,
            mr.home_goals
           FROM ((sf.fixtures f
             JOIN sf.match_results mr ON ((mr.fixture_id = f.id)))
             JOIN sf.rounds r ON (((r.season_id = f.season_id) AND (r.number = f.round))))
          WHERE ((f.kind = 'league'::text) AND (now() >= sf.reveal_at(r.kickoff_at, 90)))
        )
 SELECT season_id,
    club AS club_id,
    (count(*))::integer AS p,
    (count(*) FILTER (WHERE (gf > ga)))::integer AS w,
    (count(*) FILTER (WHERE (gf = ga)))::integer AS d,
    (count(*) FILTER (WHERE (gf < ga)))::integer AS l,
    (sum(gf))::integer AS gf,
    (sum(ga))::integer AS ga,
    ((sum(gf) - sum(ga)))::integer AS gd,
    (((3 * count(*) FILTER (WHERE (gf > ga))) + count(*) FILTER (WHERE (gf = ga))))::integer AS pts
   FROM res
  GROUP BY season_id, club;
