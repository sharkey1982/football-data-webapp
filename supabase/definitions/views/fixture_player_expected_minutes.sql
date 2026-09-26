-- Live definition exported from the database (view fixture_player_expected_minutes).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_expected_minutes with (security_invoker=true) as
 WITH base AS (
         SELECT c.fixture_id,
            c.team_id,
            c.fpl_player_id,
            c.web_name,
            c.source_consensus_probability,
            c.availability_probability,
            c.tactical_role,
            COALESCE(h.hierarchy_score, (0)::numeric) AS hierarchy_score,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            p.element_type,
            p.minutes,
            LEAST((1)::numeric, (c.source_consensus_probability * c.availability_probability)) AS start_prob,
                CASE
                    WHEN (p.element_type = 1) THEN (90)::numeric
                    WHEN (c.source_consensus_probability >= 0.8) THEN (78)::numeric
                    WHEN (c.source_consensus_probability >= 0.5) THEN (72)::numeric
                    ELSE (68)::numeric
                END AS mins_if_start,
                CASE
                    WHEN (p.element_type = 1) THEN (0)::numeric
                    WHEN (COALESCE(h.squad_status, 'unknown'::text) = 'rotation'::text) THEN 0.65
                    WHEN (COALESCE(h.squad_status, 'unknown'::text) = 'backup'::text) THEN 0.45
                    WHEN (COALESCE(h.squad_status, 'unknown'::text) = 'first_choice'::text) THEN 0.55
                    ELSE 0.20
                END AS sub_prob_if_bench,
                CASE
                    WHEN (p.element_type = 1) THEN (0)::numeric
                    WHEN (p.element_type = 4) THEN (24)::numeric
                    WHEN (p.element_type = 3) THEN (22)::numeric
                    ELSE (18)::numeric
                END AS mins_if_sub
           FROM ((fixture_player_lineup_consensus c
             JOIN fpl_players p ON ((p.fpl_player_id = c.fpl_player_id)))
             LEFT JOIN player_squad_hierarchy h ON (((h.season_id = p.season_id) AND (h.team_id = c.team_id) AND (h.fpl_player_id = c.fpl_player_id))))
        ), raw AS (
         SELECT base.fixture_id,
            base.team_id,
            base.fpl_player_id,
            base.web_name,
            base.source_consensus_probability,
            base.availability_probability,
            base.tactical_role,
            base.hierarchy_score,
            base.squad_status,
            base.element_type,
            base.minutes,
            base.start_prob,
            base.mins_if_start,
            base.sub_prob_if_bench,
            base.mins_if_sub,
            ((base.start_prob * base.mins_if_start) + (((((1)::numeric - base.start_prob) * base.sub_prob_if_bench) * base.availability_probability) * base.mins_if_sub)) AS raw_expected_minutes
           FROM base
        ), pass1 AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.source_consensus_probability,
            raw.availability_probability,
            raw.tactical_role,
            raw.hierarchy_score,
            raw.squad_status,
            raw.element_type,
            raw.minutes,
            raw.start_prob,
            raw.mins_if_start,
            raw.sub_prob_if_bench,
            raw.mins_if_sub,
            raw.raw_expected_minutes,
            LEAST((90)::numeric, ((raw.raw_expected_minutes * (990)::numeric) / NULLIF(sum(raw.raw_expected_minutes) OVER (PARTITION BY raw.fixture_id, raw.team_id), (0)::numeric))) AS mins1
           FROM raw
        ), pass2 AS (
         SELECT pass1.fixture_id,
            pass1.team_id,
            pass1.fpl_player_id,
            pass1.web_name,
            pass1.source_consensus_probability,
            pass1.availability_probability,
            pass1.tactical_role,
            pass1.hierarchy_score,
            pass1.squad_status,
            pass1.element_type,
            pass1.minutes,
            pass1.start_prob,
            pass1.mins_if_start,
            pass1.sub_prob_if_bench,
            pass1.mins_if_sub,
            pass1.raw_expected_minutes,
            pass1.mins1,
            sum(pass1.mins1) OVER (PARTITION BY pass1.fixture_id, pass1.team_id) AS sum1,
            sum(
                CASE
                    WHEN (pass1.mins1 < (90)::numeric) THEN pass1.raw_expected_minutes
                    ELSE (0)::numeric
                END) OVER (PARTITION BY pass1.fixture_id, pass1.team_id) AS uncapped_weight
           FROM pass1
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    tactical_role,
    squad_status,
    hierarchy_score,
    source_consensus_probability,
    availability_probability,
    start_prob AS prob_starting_xi,
    ((((1)::numeric - start_prob) * sub_prob_if_bench) * availability_probability) AS prob_sub_appearance,
    mins_if_start AS expected_minutes_if_start,
    mins_if_sub AS expected_minutes_if_sub,
        CASE
            WHEN (mins1 >= (90)::numeric) THEN (90)::numeric
            WHEN (uncapped_weight > (0)::numeric) THEN LEAST((90)::numeric, (mins1 + ((((990)::numeric - sum1) * raw_expected_minutes) / uncapped_weight)))
            ELSE mins1
        END AS expected_minutes
   FROM pass2;
