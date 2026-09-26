-- Live definition exported from the database (view fixture_player_expected_minutes_v2).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_expected_minutes_v2 with (security_invoker=true) as
 WITH b AS (
         SELECT c.fixture_id,
            c.team_id,
            c.fpl_player_id,
            c.web_name,
            p.element_type,
            c.tactical_role,
            h.squad_status,
            h.hierarchy_score,
            c.source_consensus_probability,
            c.availability_probability,
                CASE
                    WHEN (p.element_type = 1) THEN LEAST((c.source_consensus_probability * c.availability_probability), 0.99)
                    ELSE LEAST((c.source_consensus_probability * c.availability_probability), 0.97)
                END AS start_prob,
            COALESCE(u.appearances, (0)::bigint) AS apps,
            COALESCE(u.sub_appearances, (0)::bigint) AS hist_subs,
            COALESCE(u.avg_sub_minutes, (20)::numeric) AS hist_sub_mins
           FROM (((fixture_player_lineup_consensus c
             JOIN fpl_players p ON ((p.fpl_player_id = c.fpl_player_id)))
             LEFT JOIN player_squad_hierarchy h ON (((h.season_id = p.season_id) AND (h.fpl_player_id = p.fpl_player_id))))
             LEFT JOIN fpl_player_substitution_usage u ON (((u.season_id = p.season_id) AND (u.fpl_player_id = c.fpl_player_id))))
        ), r AS (
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
            b.start_prob,
            b.apps,
            b.hist_subs,
            b.hist_sub_mins,
            (
                CASE
                    WHEN (b.element_type = 1) THEN 90
                    WHEN (b.start_prob >= 0.8) THEN 80
                    WHEN (b.start_prob >= 0.5) THEN 74
                    ELSE 68
                END)::numeric AS mins_if_start,
                CASE
                    WHEN (b.element_type = 1) THEN (0)::numeric
                    ELSE LEAST(0.85, GREATEST(0.03, ((((b.hist_subs)::numeric + 0.5) / ((b.apps)::numeric + 2.0)) *
                    CASE b.squad_status
                        WHEN 'rotation'::text THEN 1.15
                        WHEN 'backup'::text THEN 1.0
                        WHEN 'first_choice'::text THEN 0.65
                        ELSE 0.45
                    END)))
                END AS raw_sub_prob,
            LEAST((40)::numeric, GREATEST((5)::numeric, b.hist_sub_mins)) AS mins_if_sub
           FROM b
        ), raw AS (
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
            r.start_prob,
            r.apps,
            r.hist_subs,
            r.hist_sub_mins,
            r.mins_if_start,
            r.raw_sub_prob,
            r.mins_if_sub,
            ((r.start_prob * r.mins_if_start) + (((((1)::numeric - r.start_prob) * r.raw_sub_prob) * r.availability_probability) * r.mins_if_sub)) AS raw_minutes
           FROM r
        ), s AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.element_type,
            raw.tactical_role,
            raw.squad_status,
            raw.hierarchy_score,
            raw.source_consensus_probability,
            raw.availability_probability,
            raw.start_prob,
            raw.apps,
            raw.hist_subs,
            raw.hist_sub_mins,
            raw.mins_if_start,
            raw.raw_sub_prob,
            raw.mins_if_sub,
            raw.raw_minutes,
            sum(raw.raw_minutes) OVER (PARTITION BY raw.fixture_id, raw.team_id) AS team_raw_minutes
           FROM raw
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
            s.start_prob,
            s.apps,
            s.hist_subs,
            s.hist_sub_mins,
            s.mins_if_start,
            s.raw_sub_prob,
            s.mins_if_sub,
            s.raw_minutes,
            s.team_raw_minutes,
            LEAST((90)::numeric, ((s.raw_minutes * (990)::numeric) / NULLIF(s.team_raw_minutes, (0)::numeric))) AS capped_minutes
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
            c.start_prob,
            c.apps,
            c.hist_subs,
            c.hist_sub_mins,
            c.mins_if_start,
            c.raw_sub_prob,
            c.mins_if_sub,
            c.raw_minutes,
            c.team_raw_minutes,
            c.capped_minutes,
            ((990)::numeric - sum(c.capped_minutes) OVER (PARTITION BY c.fixture_id, c.team_id)) AS residual_minutes,
            sum(
                CASE
                    WHEN (c.capped_minutes < (90)::numeric) THEN ((90)::numeric - c.capped_minutes)
                    ELSE (0)::numeric
                END) OVER (PARTITION BY c.fixture_id, c.team_id) AS spare_capacity
           FROM c
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    tactical_role,
    COALESCE(squad_status, 'unknown'::text) AS squad_status,
    hierarchy_score,
    source_consensus_probability,
    availability_probability,
    start_prob AS prob_starting_xi,
    ((((1)::numeric - start_prob) * raw_sub_prob) * availability_probability) AS prob_sub_appearance,
    mins_if_start,
    mins_if_sub,
    LEAST((90)::numeric, (capped_minutes +
        CASE
            WHEN (spare_capacity > (0)::numeric) THEN (residual_minutes * (((90)::numeric - capped_minutes) / spare_capacity))
            ELSE (0)::numeric
        END)) AS expected_minutes,
    hist_subs,
    hist_sub_mins
   FROM z;
