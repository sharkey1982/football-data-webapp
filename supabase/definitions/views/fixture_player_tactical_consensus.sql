-- Live definition exported from the database (view fixture_player_tactical_consensus).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_tactical_consensus with (security_invoker=true) as
 WITH real_consensus AS (
         SELECT lp.fixture_id,
            lp.team_id,
            lpp.fpl_player_id,
            lpp.tactical_role,
            sum((ls.source_weight * COALESCE(lpp.source_start_probability, (1)::numeric))) AS role_weight,
            count(*) AS sources
           FROM ((fixture_lineup_predictions lp
             JOIN fixture_lineup_prediction_players lpp ON ((lpp.lineup_prediction_id = lp.lineup_prediction_id)))
             JOIN lineup_prediction_sources ls ON (((ls.lineup_source_id = lp.lineup_source_id) AND ls.active)))
          WHERE (lpp.tactical_role IS NOT NULL)
          GROUP BY lp.fixture_id, lp.team_id, lpp.fpl_player_id, lpp.tactical_role
        ), ranked_real AS (
         SELECT real_consensus.fixture_id,
            real_consensus.team_id,
            real_consensus.fpl_player_id,
            real_consensus.tactical_role,
            real_consensus.role_weight,
            real_consensus.sources,
            row_number() OVER (PARTITION BY real_consensus.fixture_id, real_consensus.team_id, real_consensus.fpl_player_id ORDER BY real_consensus.role_weight DESC, real_consensus.tactical_role) AS rn
           FROM real_consensus
        ), projected AS (
         SELECT f.fixture_id,
                CASE
                    WHEN (fp.canonical_team_id = f.home_team_id) THEN f.home_team_id
                    ELSE f.away_team_id
                END AS team_id,
            fp.fpl_player_id,
            fp.element_type
           FROM (fpl_players fp
             JOIN fixtures f ON ((((f.home_team_id = fp.canonical_team_id) OR (f.away_team_id = fp.canonical_team_id)) AND (f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))))
          WHERE (fp.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id))
        ), fallback AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            COALESCE(td.tactical_role,
                CASE b.element_type
                    WHEN 1 THEN 'GK'::text
                    WHEN 2 THEN 'DEF'::text
                    WHEN 3 THEN 'MID'::text
                    WHEN 4 THEN 'CF'::text
                    ELSE 'UNK'::text
                END) AS tactical_role,
            COALESCE(td.confidence, 0.30) AS role_weight,
            (0)::bigint AS sources
           FROM (projected b
             LEFT JOIN team_player_tactical_defaults td ON (((td.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (td.team_id = b.team_id) AND (td.fpl_player_id = b.fpl_player_id))))
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM ranked_real r
                  WHERE ((r.fixture_id = b.fixture_id) AND (r.team_id = b.team_id) AND (r.fpl_player_id = b.fpl_player_id) AND (r.rn = 1)))))
        )
 SELECT ranked_real.fixture_id,
    ranked_real.team_id,
    ranked_real.fpl_player_id,
    ranked_real.tactical_role,
    ranked_real.role_weight,
    ranked_real.sources
   FROM ranked_real
  WHERE (ranked_real.rn = 1)
UNION ALL
 SELECT fallback.fixture_id,
    fallback.team_id,
    fallback.fpl_player_id,
    fallback.tactical_role,
    fallback.role_weight,
    fallback.sources
   FROM fallback;
