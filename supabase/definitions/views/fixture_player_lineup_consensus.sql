-- Live definition exported from the database (view fixture_player_lineup_consensus).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_lineup_consensus with (security_invoker=true) as
 WITH source_totals AS (
         SELECT lp.fixture_id,
            lp.team_id,
            sum(s.source_weight) AS available_weight,
            count(*) AS source_count
           FROM (fixture_lineup_predictions lp
             JOIN lineup_prediction_sources s ON ((s.lineup_source_id = lp.lineup_source_id)))
          WHERE s.active
          GROUP BY lp.fixture_id, lp.team_id
        ), votes AS (
         SELECT lp.fixture_id,
            lp.team_id,
            lpp.fpl_player_id,
            sum(
                CASE
                    WHEN lpp.predicted_start THEN s.source_weight
                    ELSE (0)::numeric
                END) AS positive_weight,
            count(*) FILTER (WHERE lpp.predicted_start) AS positive_sources,
            max(lpp.tactical_role) AS tactical_role
           FROM ((fixture_lineup_predictions lp
             JOIN fixture_lineup_prediction_players lpp ON ((lpp.lineup_prediction_id = lp.lineup_prediction_id)))
             JOIN lineup_prediction_sources s ON ((s.lineup_source_id = lp.lineup_source_id)))
          WHERE s.active
          GROUP BY lp.fixture_id, lp.team_id, lpp.fpl_player_id
        )
 SELECT st.fixture_id,
    st.team_id,
    p.fpl_player_id,
    p.web_name,
    COALESCE(v.positive_weight, (0)::numeric) AS positive_weight,
    st.available_weight,
    COALESCE(v.positive_sources, (0)::bigint) AS positive_sources,
    st.source_count,
        CASE
            WHEN (st.available_weight > (0)::numeric) THEN (COALESCE(v.positive_weight, (0)::numeric) / st.available_weight)
            ELSE (0)::numeric
        END AS source_consensus_probability,
        CASE
            WHEN (p.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN (0)::numeric
            WHEN (p.chance_of_playing_next_round IS NOT NULL) THEN ((p.chance_of_playing_next_round)::numeric / (100)::numeric)
            ELSE (1)::numeric
        END AS availability_probability,
    v.tactical_role
   FROM ((source_totals st
     JOIN fpl_players p ON ((p.canonical_team_id = st.team_id)))
     LEFT JOIN votes v ON (((v.fixture_id = st.fixture_id) AND (v.team_id = st.team_id) AND (v.fpl_player_id = p.fpl_player_id))));
