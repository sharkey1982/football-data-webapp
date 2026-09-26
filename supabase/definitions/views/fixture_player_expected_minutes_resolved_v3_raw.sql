-- Live definition exported from the database (view fixture_player_expected_minutes_resolved_v3_raw).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_expected_minutes_resolved_v3_raw with (security_invoker=true) as
 SELECT r.fixture_id,
    r.team_id,
    r.fpl_player_id,
    r.web_name,
    r.element_type,
        CASE
            WHEN (src.fpl_player_id IS NOT NULL) THEN r.expected_minutes
            WHEN (ss.start_probability_override IS NOT NULL) THEN LEAST((90)::numeric, GREATEST((0)::numeric, ((ss.start_probability_override * (
            CASE
                WHEN (r.element_type = 1) THEN 90
                ELSE 80
            END)::numeric) + (r.prob_sub_appearance * (20)::numeric))))
            ELSE LEAST((90)::numeric, GREATEST((0)::numeric, ((p.start_probability * (
            CASE
                WHEN (r.element_type = 1) THEN 90
                ELSE 80
            END)::numeric) + (r.prob_sub_appearance * (20)::numeric))))
        END AS expected_minutes,
    COALESCE(src.prob_starting_xi, ss.start_probability_override, p.start_probability, r.prob_starting_xi) AS prob_starting_xi,
    r.prob_sub_appearance,
    COALESCE(ss.availability_probability, p.availability, r.availability_probability) AS availability_probability,
    r.tactical_role,
        CASE
            WHEN (src.fpl_player_id IS NOT NULL) THEN r.minutes_source
            WHEN (ss.start_probability_override IS NOT NULL) THEN 'squad_state_override'::text
            WHEN (p.probability_source = 'nailed_history'::text) THEN 'nailed_history_v6'::text
            WHEN (p.probability_source = 'strong_history'::text) THEN 'strong_history_v6'::text
            ELSE 'fallback_history_v6'::text
        END AS minutes_source
   FROM (((fixture_player_expected_minutes_resolved r
     LEFT JOIN fixture_player_expected_minutes_v3 src ON (((src.fixture_id = r.fixture_id) AND (src.fpl_player_id = r.fpl_player_id))))
     LEFT JOIN fpl_fallback_start_probability_v6 p ON (((p.fixture_id = r.fixture_id) AND (p.fpl_player_id = r.fpl_player_id))))
     LEFT JOIN fpl_player_squad_state_current ss ON (((ss.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (ss.fpl_player_id = r.fpl_player_id) AND (ss.team_id = r.team_id))));
