-- Live definition exported from the database (view fpl_set_piece_fixture_adjustments_v1).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_set_piece_fixture_adjustments_v1 with (security_invoker=true) as
 WITH raw AS (
         SELECT fpl_set_piece_fixture_exposure_v1.fixture_id,
            fpl_set_piece_fixture_exposure_v1.team_id,
            fpl_set_piece_fixture_exposure_v1.fpl_player_id,
            max(
                CASE
                    WHEN (fpl_set_piece_fixture_exposure_v1.set_piece_type = 'penalty'::text) THEN ((((1.0 / (fpl_set_piece_fixture_exposure_v1.rank)::numeric) * fpl_set_piece_fixture_exposure_v1.prob_starting_xi) * fpl_set_piece_fixture_exposure_v1.expected_minutes) / (90)::numeric)
                    ELSE (0)::numeric
                END) AS penalty_raw,
            max(
                CASE
                    WHEN (fpl_set_piece_fixture_exposure_v1.set_piece_type = 'direct_free_kick'::text) THEN ((((1.0 / (fpl_set_piece_fixture_exposure_v1.rank)::numeric) * fpl_set_piece_fixture_exposure_v1.prob_starting_xi) * fpl_set_piece_fixture_exposure_v1.expected_minutes) / (90)::numeric)
                    ELSE (0)::numeric
                END) AS fk_raw,
            max(
                CASE
                    WHEN (fpl_set_piece_fixture_exposure_v1.set_piece_type = ANY (ARRAY['corner_left'::text, 'corner_right'::text, 'indirect_free_kick'::text])) THEN ((((1.0 / (fpl_set_piece_fixture_exposure_v1.rank)::numeric) * fpl_set_piece_fixture_exposure_v1.prob_starting_xi) * fpl_set_piece_fixture_exposure_v1.expected_minutes) / (90)::numeric)
                    ELSE (0)::numeric
                END) AS creation_raw
           FROM fpl_set_piece_fixture_exposure_v1
          GROUP BY fpl_set_piece_fixture_exposure_v1.fixture_id, fpl_set_piece_fixture_exposure_v1.team_id, fpl_set_piece_fixture_exposure_v1.fpl_player_id
        ), n AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.penalty_raw,
            raw.fk_raw,
            raw.creation_raw,
            sum(raw.penalty_raw) OVER (PARTITION BY raw.fixture_id, raw.team_id) AS sp,
            sum(raw.fk_raw) OVER (PARTITION BY raw.fixture_id, raw.team_id) AS sf,
            sum(raw.creation_raw) OVER (PARTITION BY raw.fixture_id, raw.team_id) AS sc
           FROM raw
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    round(
        CASE
            WHEN (sp > (1)::numeric) THEN (penalty_raw / sp)
            ELSE penalty_raw
        END, 6) AS penalty_exposure,
    round(
        CASE
            WHEN (sf > (1)::numeric) THEN (fk_raw / sf)
            ELSE fk_raw
        END, 6) AS direct_fk_exposure,
    round(
        CASE
            WHEN (sc > (1)::numeric) THEN (creation_raw / sc)
            ELSE creation_raw
        END, 6) AS creation_exposure
   FROM n;
