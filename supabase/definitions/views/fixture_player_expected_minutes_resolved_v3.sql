-- Live definition exported from the database (view fixture_player_expected_minutes_resolved_v3).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_expected_minutes_resolved_v3 with (security_invoker=true) as
 WITH r AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.element_type,
            raw.expected_minutes,
            raw.prob_starting_xi,
            raw.prob_sub_appearance,
            raw.availability_probability,
            raw.tactical_role,
            raw.minutes_source,
            (raw.element_type = 1) AS is_gk,
            row_number() OVER (PARTITION BY raw.fixture_id, raw.team_id, (raw.element_type = 1) ORDER BY raw.expected_minutes DESC, raw.prob_starting_xi DESC, raw.fpl_player_id) AS gk_rank
           FROM fixture_player_expected_minutes_resolved_v3_raw raw
        ), t AS (
         SELECT r.fixture_id,
            r.team_id,
            r.fpl_player_id,
            r.web_name,
            r.element_type,
            r.expected_minutes,
            r.prob_starting_xi,
            r.prob_sub_appearance,
            r.availability_probability,
            r.tactical_role,
            r.minutes_source,
            r.is_gk,
            r.gk_rank,
            sum(r.expected_minutes) OVER w AS team_min,
            sum(r.prob_starting_xi) OVER w AS team_start,
            sum((r.expected_minutes * ((1)::numeric - LEAST(r.prob_starting_xi, (1)::numeric)))) OVER w AS w_min_sum,
            sum((r.prob_starting_xi * ((1)::numeric - LEAST(r.prob_starting_xi, (1)::numeric)))) OVER w AS w_start_sum,
            max(
                CASE
                    WHEN (r.gk_rank = 1) THEN LEAST(r.expected_minutes, (90)::numeric)
                    ELSE NULL::numeric
                END) OVER w AS lead_gk_min,
            max(
                CASE
                    WHEN (r.gk_rank = 1) THEN LEAST(r.prob_starting_xi, (1)::numeric)
                    ELSE NULL::numeric
                END) OVER w AS lead_gk_start,
            sum(
                CASE
                    WHEN (r.gk_rank > 1) THEN r.expected_minutes
                    ELSE (0)::numeric
                END) OVER w AS other_gk_min,
            sum(
                CASE
                    WHEN (r.gk_rank > 1) THEN r.prob_starting_xi
                    ELSE (0)::numeric
                END) OVER w AS other_gk_start
           FROM r
          WINDOW w AS (PARTITION BY r.fixture_id, r.team_id, r.is_gk)
        ), n AS (
         SELECT t.fixture_id,
            t.team_id,
            t.fpl_player_id,
            t.web_name,
            t.element_type,
            t.expected_minutes,
            t.prob_starting_xi,
            t.prob_sub_appearance,
            t.availability_probability,
            t.tactical_role,
            t.minutes_source,
            t.is_gk,
            t.gk_rank,
            t.team_min,
            t.team_start,
            t.w_min_sum,
            t.w_start_sum,
            t.lead_gk_min,
            t.lead_gk_start,
            t.other_gk_min,
            t.other_gk_start,
                CASE
                    WHEN (t.is_gk AND (t.gk_rank = 1)) THEN LEAST(t.expected_minutes, (90)::numeric)
                    WHEN t.is_gk THEN (t.expected_minutes * LEAST((1)::numeric, (GREATEST(((90)::numeric - t.lead_gk_min), (0)::numeric) / NULLIF(t.other_gk_min, (0)::numeric))))
                    WHEN ((t.team_min <= (900)::numeric) OR (t.w_min_sum = (0)::numeric)) THEN t.expected_minutes
                    ELSE GREATEST((0)::numeric, (t.expected_minutes - ((((t.team_min - (900)::numeric) * t.expected_minutes) * ((1)::numeric - LEAST(t.prob_starting_xi, (1)::numeric))) / t.w_min_sum)))
                END AS new_min,
                CASE
                    WHEN (t.is_gk AND (t.gk_rank = 1)) THEN LEAST(t.prob_starting_xi, (1)::numeric)
                    WHEN t.is_gk THEN (t.prob_starting_xi * LEAST((1)::numeric, (GREATEST(((1)::numeric - t.lead_gk_start), (0)::numeric) / NULLIF(t.other_gk_start, (0)::numeric))))
                    WHEN ((t.team_start <= (10)::numeric) OR (t.w_start_sum = (0)::numeric)) THEN t.prob_starting_xi
                    ELSE GREATEST((0)::numeric, (t.prob_starting_xi - ((((t.team_start - (10)::numeric) * t.prob_starting_xi) * ((1)::numeric - LEAST(t.prob_starting_xi, (1)::numeric))) / t.w_start_sum)))
                END AS new_start
           FROM t
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    COALESCE(new_min, expected_minutes) AS expected_minutes,
    COALESCE(new_start, prob_starting_xi) AS prob_starting_xi,
        CASE
            WHEN (is_gk AND (gk_rank > 1) AND (expected_minutes > (0)::numeric)) THEN ((prob_sub_appearance * COALESCE(new_min, expected_minutes)) / expected_minutes)
            ELSE prob_sub_appearance
        END AS prob_sub_appearance,
    availability_probability,
    tactical_role,
    minutes_source
   FROM n;
