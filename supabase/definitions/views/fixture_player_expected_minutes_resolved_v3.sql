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
        ), c AS (
         SELECT n.fixture_id,
            n.team_id,
            n.fpl_player_id,
            n.web_name,
            n.element_type,
            n.expected_minutes,
            n.prob_starting_xi,
            n.prob_sub_appearance,
            n.availability_probability,
            n.tactical_role,
            n.minutes_source,
            n.is_gk,
            n.gk_rank,
            n.team_min,
            n.team_start,
            n.w_min_sum,
            n.w_start_sum,
            n.lead_gk_min,
            n.lead_gk_start,
            n.other_gk_min,
            n.other_gk_start,
            n.new_min,
            n.new_start,
            GREATEST((0)::numeric, (COALESCE(n.new_start, n.prob_starting_xi) - COALESCE(n.availability_probability, (1)::numeric))) AS over_avail
           FROM n
        ), h AS (
         SELECT c.fixture_id,
            c.team_id,
            c.fpl_player_id,
            c.web_name,
            c.element_type,
            c.expected_minutes,
            c.prob_starting_xi,
            c.prob_sub_appearance,
            c.availability_probability,
            c.tactical_role,
            c.minutes_source,
            c.is_gk,
            c.gk_rank,
            c.team_min,
            c.team_start,
            c.w_min_sum,
            c.w_start_sum,
            c.lead_gk_min,
            c.lead_gk_start,
            c.other_gk_min,
            c.other_gk_start,
            c.new_min,
            c.new_start,
            c.over_avail,
            (COALESCE(c.new_start, c.prob_starting_xi) - c.over_avail) AS s1,
            GREATEST((0)::numeric, (COALESCE(c.new_min, c.expected_minutes) - (c.over_avail * (
                CASE
                    WHEN c.is_gk THEN 90
                    ELSE 80
                END)::numeric))) AS m1,
            GREATEST((0)::numeric, (LEAST(0.98, COALESCE(c.availability_probability, (1)::numeric)) - (COALESCE(c.new_start, c.prob_starting_xi) - c.over_avail))) AS cap
           FROM c
        ), h2 AS (
         SELECT h.fixture_id,
            h.team_id,
            h.fpl_player_id,
            h.web_name,
            h.element_type,
            h.expected_minutes,
            h.prob_starting_xi,
            h.prob_sub_appearance,
            h.availability_probability,
            h.tactical_role,
            h.minutes_source,
            h.is_gk,
            h.gk_rank,
            h.team_min,
            h.team_start,
            h.w_min_sum,
            h.w_start_sum,
            h.lead_gk_min,
            h.lead_gk_start,
            h.other_gk_min,
            h.other_gk_start,
            h.new_min,
            h.new_start,
            h.over_avail,
            h.s1,
            h.m1,
            h.cap,
            GREATEST((0)::numeric, (
                CASE
                    WHEN h.is_gk THEN (1)::numeric
                    ELSE (10)::numeric
                END - sum(h.s1) OVER w2)) AS deficit,
            sum((h.s1 * h.cap)) OVER w2 AS w_sum,
            sum(h.cap) OVER w2 AS cap_sum
           FROM h
          WINDOW w2 AS (PARTITION BY h.fixture_id, h.team_id, h.is_gk)
        ), h3 AS (
         SELECT h2.fixture_id,
            h2.team_id,
            h2.fpl_player_id,
            h2.web_name,
            h2.element_type,
            h2.expected_minutes,
            h2.prob_starting_xi,
            h2.prob_sub_appearance,
            h2.availability_probability,
            h2.tactical_role,
            h2.minutes_source,
            h2.is_gk,
            h2.gk_rank,
            h2.team_min,
            h2.team_start,
            h2.w_min_sum,
            h2.w_start_sum,
            h2.lead_gk_min,
            h2.lead_gk_start,
            h2.other_gk_min,
            h2.other_gk_start,
            h2.new_min,
            h2.new_start,
            h2.over_avail,
            h2.s1,
            h2.m1,
            h2.cap,
            h2.deficit,
            h2.w_sum,
            h2.cap_sum,
                CASE
                    WHEN ((h2.deficit > (0)::numeric) AND (h2.w_sum > (0)::numeric)) THEN LEAST(h2.cap, (((h2.deficit * h2.s1) * h2.cap) / h2.w_sum))
                    ELSE (0)::numeric
                END AS add1
           FROM h2
        ), h4 AS (
         SELECT h3.fixture_id,
            h3.team_id,
            h3.fpl_player_id,
            h3.web_name,
            h3.element_type,
            h3.expected_minutes,
            h3.prob_starting_xi,
            h3.prob_sub_appearance,
            h3.availability_probability,
            h3.tactical_role,
            h3.minutes_source,
            h3.is_gk,
            h3.gk_rank,
            h3.team_min,
            h3.team_start,
            h3.w_min_sum,
            h3.w_start_sum,
            h3.lead_gk_min,
            h3.lead_gk_start,
            h3.other_gk_min,
            h3.other_gk_start,
            h3.new_min,
            h3.new_start,
            h3.over_avail,
            h3.s1,
            h3.m1,
            h3.cap,
            h3.deficit,
            h3.w_sum,
            h3.cap_sum,
            h3.add1,
            GREATEST((0)::numeric, (h3.deficit - sum(h3.add1) OVER w3)) AS residual,
            sum((h3.cap - h3.add1)) OVER w3 AS cap2_sum
           FROM h3
          WINDOW w3 AS (PARTITION BY h3.fixture_id, h3.team_id, h3.is_gk)
        ), u AS (
         SELECT h4.fixture_id,
            h4.team_id,
            h4.fpl_player_id,
            h4.web_name,
            h4.element_type,
            h4.expected_minutes,
            h4.prob_starting_xi,
            h4.prob_sub_appearance,
            h4.availability_probability,
            h4.tactical_role,
            h4.minutes_source,
            h4.is_gk,
            h4.gk_rank,
            h4.team_min,
            h4.team_start,
            h4.w_min_sum,
            h4.w_start_sum,
            h4.lead_gk_min,
            h4.lead_gk_start,
            h4.other_gk_min,
            h4.other_gk_start,
            h4.new_min,
            h4.new_start,
            h4.over_avail,
            h4.s1,
            h4.m1,
            h4.cap,
            h4.deficit,
            h4.w_sum,
            h4.cap_sum,
            h4.add1,
            h4.residual,
            h4.cap2_sum,
            (h4.add1 +
                CASE
                    WHEN ((h4.residual > (0)::numeric) AND (h4.cap2_sum > (0)::numeric)) THEN LEAST((h4.cap - h4.add1), ((h4.residual * (h4.cap - h4.add1)) / h4.cap2_sum))
                    ELSE (0)::numeric
                END) AS add_start
           FROM h4
        ), v AS (
         SELECT u.fixture_id,
            u.team_id,
            u.fpl_player_id,
            u.web_name,
            u.element_type,
            u.expected_minutes,
            u.prob_starting_xi,
            u.prob_sub_appearance,
            u.availability_probability,
            u.tactical_role,
            u.minutes_source,
            u.is_gk,
            u.gk_rank,
            u.team_min,
            u.team_start,
            u.w_min_sum,
            u.w_start_sum,
            u.lead_gk_min,
            u.lead_gk_start,
            u.other_gk_min,
            u.other_gk_start,
            u.new_min,
            u.new_start,
            u.over_avail,
            u.s1,
            u.m1,
            u.cap,
            u.deficit,
            u.w_sum,
            u.cap_sum,
            u.add1,
            u.residual,
            u.cap2_sum,
            u.add_start,
            (u.s1 + u.add_start) AS s2,
                CASE
                    WHEN (u.is_gk AND (u.gk_rank > 1) AND (u.expected_minutes > (0)::numeric)) THEN ((u.prob_sub_appearance * u.m1) / u.expected_minutes)
                    ELSE u.prob_sub_appearance
                END AS sub1
           FROM u
        ), x AS (
         SELECT v.fixture_id,
            v.team_id,
            v.fpl_player_id,
            v.web_name,
            v.element_type,
            v.expected_minutes,
            v.prob_starting_xi,
            v.prob_sub_appearance,
            v.availability_probability,
            v.tactical_role,
            v.minutes_source,
            v.is_gk,
            v.gk_rank,
            v.team_min,
            v.team_start,
            v.w_min_sum,
            v.w_start_sum,
            v.lead_gk_min,
            v.lead_gk_start,
            v.other_gk_min,
            v.other_gk_start,
            v.new_min,
            v.new_start,
            v.over_avail,
            v.s1,
            v.m1,
            v.cap,
            v.deficit,
            v.w_sum,
            v.cap_sum,
            v.add1,
            v.residual,
            v.cap2_sum,
            v.add_start,
            v.s2,
            v.sub1,
                CASE
                    WHEN (v.add_start > (0)::numeric) THEN LEAST(v.sub1, GREATEST((0)::numeric, ((1)::numeric - v.s2)))
                    ELSE v.sub1
                END AS sub2
           FROM v
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
        CASE
            WHEN (add_start > (0)::numeric) THEN LEAST((90)::numeric, GREATEST((0)::numeric, ((m1 + (add_start * (
            CASE
                WHEN is_gk THEN 90
                ELSE 80
            END)::numeric)) + ((sub2 - sub1) * (20)::numeric))))
            ELSE m1
        END AS expected_minutes,
    s2 AS prob_starting_xi,
    sub2 AS prob_sub_appearance,
    availability_probability,
    tactical_role,
    minutes_source
   FROM x;
