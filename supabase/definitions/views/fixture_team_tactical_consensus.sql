-- Live definition exported from the database (view fixture_team_tactical_consensus).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_team_tactical_consensus with (security_invoker=true) as
 WITH x AS (
         SELECT lp.fixture_id,
            lp.team_id,
            lp.formation,
            sum(s.source_weight) AS weight,
            count(*) AS sources,
            row_number() OVER (PARTITION BY lp.fixture_id, lp.team_id ORDER BY (sum(s.source_weight)) DESC, (count(*)) DESC, lp.formation) AS rn
           FROM (fixture_lineup_predictions lp
             JOIN lineup_prediction_sources s ON (((s.lineup_source_id = lp.lineup_source_id) AND s.active)))
          GROUP BY lp.fixture_id, lp.team_id, lp.formation
        ), manual AS (
         SELECT f.fixture_id,
            t.team_id,
            d.formation,
            d.confidence AS consensus_weight,
            (0)::bigint AS sources
           FROM ((fixtures f
             CROSS JOIN LATERAL ( VALUES (f.home_team_id), (f.away_team_id)) t(team_id))
             JOIN team_tactical_defaults d ON (((d.season_id = f.season_id) AND (d.team_id = t.team_id))))
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (d.source_name = 'manual'::text) AND (EXISTS ( SELECT 1
                   FROM fpl_player_projections p
                  WHERE ((p.fixture_id = f.fixture_id) AND (p.model_version = 'leaguewide_v4'::text)))))
        ), src AS (
         SELECT x.fixture_id,
            x.team_id,
            x.formation,
            x.weight AS consensus_weight,
            x.sources
           FROM x
          WHERE ((x.rn = 1) AND (NOT (EXISTS ( SELECT 1
                   FROM manual m
                  WHERE ((m.fixture_id = x.fixture_id) AND (m.team_id = x.team_id))))))
        ), fallback AS (
         SELECT f.fixture_id,
            t.team_id,
            d.formation,
            d.confidence AS consensus_weight,
            (0)::bigint AS sources
           FROM ((fixtures f
             CROSS JOIN LATERAL ( VALUES (f.home_team_id), (f.away_team_id)) t(team_id))
             JOIN team_tactical_defaults d ON (((d.season_id = f.season_id) AND (d.team_id = t.team_id))))
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (d.source_name <> 'manual'::text) AND (EXISTS ( SELECT 1
                   FROM fpl_player_projections p
                  WHERE ((p.fixture_id = f.fixture_id) AND (p.model_version = 'leaguewide_v4'::text)))) AND (NOT (EXISTS ( SELECT 1
                   FROM src s
                  WHERE ((s.fixture_id = f.fixture_id) AND (s.team_id = t.team_id))))))
        )
 SELECT manual.fixture_id,
    manual.team_id,
    manual.formation,
    manual.consensus_weight,
    manual.sources
   FROM manual
UNION ALL
 SELECT src.fixture_id,
    src.team_id,
    src.formation,
    src.consensus_weight,
    src.sources
   FROM src
UNION ALL
 SELECT fallback.fixture_id,
    fallback.team_id,
    fallback.formation,
    fallback.consensus_weight,
    fallback.sources
   FROM fallback;
