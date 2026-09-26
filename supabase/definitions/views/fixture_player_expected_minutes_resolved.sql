-- Live definition exported from the database (view fixture_player_expected_minutes_resolved).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_expected_minutes_resolved with (security_invoker=true) as
 SELECT fb.fixture_id,
    fb.team_id,
    fb.fpl_player_id,
    fb.web_name,
    fb.element_type,
    COALESCE(v.expected_minutes, fb.expected_minutes) AS expected_minutes,
    COALESCE(v.prob_starting_xi, fb.prob_starting_xi) AS prob_starting_xi,
    COALESCE(v.prob_sub_appearance, fb.prob_sub_appearance) AS prob_sub_appearance,
    COALESCE(v.availability_probability, fb.availability) AS availability_probability,
    COALESCE(tc.tactical_role, fb.tactical_role) AS tactical_role,
        CASE
            WHEN (v.fpl_player_id IS NOT NULL) THEN 'lineup_consensus_v3'::text
            ELSE fb.minutes_source
        END AS minutes_source
   FROM ((fixture_player_expected_minutes_fallback fb
     LEFT JOIN fixture_player_expected_minutes_v3 v ON (((v.fixture_id = fb.fixture_id) AND (v.fpl_player_id = fb.fpl_player_id))))
     LEFT JOIN fixture_player_tactical_consensus tc ON (((tc.fixture_id = fb.fixture_id) AND (tc.fpl_player_id = fb.fpl_player_id))));
