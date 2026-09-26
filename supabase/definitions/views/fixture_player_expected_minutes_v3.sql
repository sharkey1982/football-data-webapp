-- Live definition exported from the database (view fixture_player_expected_minutes_v3).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_expected_minutes_v3 with (security_invoker=true) as
 WITH b AS (
         SELECT v.fixture_id,
            v.team_id,
            v.fpl_player_id,
            v.web_name,
            v.element_type,
            v.tactical_role,
            v.squad_status,
            v.hierarchy_score,
            v.source_consensus_probability,
            v.availability_probability,
            v.prob_starting_xi,
            v.prob_sub_appearance,
            v.mins_if_start,
            v.mins_if_sub,
            v.expected_minutes,
            v.hist_subs,
            v.hist_sub_mins,
            sum(v.prob_sub_appearance) OVER (PARTITION BY v.fixture_id, v.team_id) AS team_sub_sum
           FROM fixture_player_expected_minutes_v2 v
        ), n AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            b.web_name,
            b.element_type,
            b.tactical_role,
            b.squad_status,
            b.hierarchy_score,
            b.source_consensus_probability,
            b.availability_probability,
            b.prob_starting_xi,
            b.prob_sub_appearance,
            b.mins_if_start,
            b.mins_if_sub,
            b.expected_minutes,
            b.hist_subs,
            b.hist_sub_mins,
            b.team_sub_sum,
                CASE
                    WHEN (b.team_sub_sum > (0)::numeric) THEN (b.prob_sub_appearance * (4.25 / b.team_sub_sum))
                    ELSE (0)::numeric
                END AS norm_sub_prob
           FROM b
        ), r AS (
         SELECT n.fixture_id,
            n.team_id,
            n.fpl_player_id,
            n.web_name,
            n.element_type,
            n.tactical_role,
            n.squad_status,
            n.hierarchy_score,
            n.source_consensus_probability,
            n.availability_probability,
            n.prob_starting_xi,
            n.prob_sub_appearance,
            n.mins_if_start,
            n.mins_if_sub,
            n.expected_minutes,
            n.hist_subs,
            n.hist_sub_mins,
            n.team_sub_sum,
            n.norm_sub_prob,
            ((n.prob_starting_xi * n.mins_if_start) + (n.norm_sub_prob * n.mins_if_sub)) AS raw_minutes
           FROM n
        ), s AS (
         SELECT r.fixture_id,
            r.team_id,
            r.fpl_player_id,
            r.web_name,
            r.element_type,
            r.tactical_role,
            r.squad_status,
            r.hierarchy_score,
            r.source_consensus_probability,
            r.availability_probability,
            r.prob_starting_xi,
            r.prob_sub_appearance,
            r.mins_if_start,
            r.mins_if_sub,
            r.expected_minutes,
            r.hist_subs,
            r.hist_sub_mins,
            r.team_sub_sum,
            r.norm_sub_prob,
            r.raw_minutes,
            sum(r.raw_minutes) OVER (PARTITION BY r.fixture_id, r.team_id) AS team_raw
           FROM r
        ), c AS (
         SELECT s.fixture_id,
            s.team_id,
            s.fpl_player_id,
            s.web_name,
            s.element_type,
            s.tactical_role,
            s.squad_status,
            s.hierarchy_score,
            s.source_consensus_probability,
            s.availability_probability,
            s.prob_starting_xi,
            s.prob_sub_appearance,
            s.mins_if_start,
            s.mins_if_sub,
            s.expected_minutes,
            s.hist_subs,
            s.hist_sub_mins,
            s.team_sub_sum,
            s.norm_sub_prob,
            s.raw_minutes,
            s.team_raw,
            LEAST((90)::numeric, ((s.raw_minutes * (990)::numeric) / NULLIF(s.team_raw, (0)::numeric))) AS capped_minutes
           FROM s
        ), z AS (
         SELECT c.fixture_id,
            c.team_id,
            c.fpl_player_id,
            c.web_name,
            c.element_type,
            c.tactical_role,
            c.squad_status,
            c.hierarchy_score,
            c.source_consensus_probability,
            c.availability_probability,
            c.prob_starting_xi,
            c.prob_sub_appearance,
            c.mins_if_start,
            c.mins_if_sub,
            c.expected_minutes,
            c.hist_subs,
            c.hist_sub_mins,
            c.team_sub_sum,
            c.norm_sub_prob,
            c.raw_minutes,
            c.team_raw,
            c.capped_minutes,
            ((990)::numeric - sum(c.capped_minutes) OVER (PARTITION BY c.fixture_id, c.team_id)) AS residual,
            sum(
                CASE
                    WHEN (c.capped_minutes < (90)::numeric) THEN ((90)::numeric - c.capped_minutes)
                    ELSE (0)::numeric
                END) OVER (PARTITION BY c.fixture_id, c.team_id) AS spare
           FROM c
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
    prob_starting_xi,
    LEAST((1)::numeric, norm_sub_prob) AS prob_sub_appearance,
    mins_if_start,
    mins_if_sub,
    LEAST((90)::numeric, (capped_minutes +
        CASE
            WHEN (spare > (0)::numeric) THEN (residual * (((90)::numeric - capped_minutes) / spare))
            ELSE (0)::numeric
        END)) AS expected_minutes,
    hist_subs,
    hist_sub_mins
   FROM z;
