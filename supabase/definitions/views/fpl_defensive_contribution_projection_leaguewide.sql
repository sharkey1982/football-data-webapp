-- Live definition exported from the database (view fpl_defensive_contribution_projection_leaguewide).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_defensive_contribution_projection_leaguewide with (security_invoker=true) as
 WITH h AS (
         SELECT fpl_player_defensive_contribution_usage.season_id,
            fpl_player_defensive_contribution_usage.fpl_player_id,
            fpl_player_defensive_contribution_usage.element_type,
            fpl_player_defensive_contribution_usage.minutes,
                CASE
                    WHEN (fpl_player_defensive_contribution_usage.element_type = 2) THEN fpl_player_defensive_contribution_usage.cbi
                    ELSE ((fpl_player_defensive_contribution_usage.cbi + fpl_player_defensive_contribution_usage.recoveries) + fpl_player_defensive_contribution_usage.tackles)
                END AS events
           FROM fpl_player_defensive_contribution_usage
          WHERE (fpl_player_defensive_contribution_usage.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id))
        ), b AS (
         SELECT a.fixture_id,
            a.team_id,
            a.fpl_player_id,
            a.expected_minutes,
            a.prob_starting_xi,
            a.element_type,
                CASE a.element_type
                    WHEN 2 THEN 7.143
                    WHEN 3 THEN 7.107
                    WHEN 4 THEN 3.681
                    ELSE (0)::numeric
                END AS prior90,
                CASE a.element_type
                    WHEN 2 THEN 0.255
                    WHEN 3 THEN 0.125
                    WHEN 4 THEN 0.01
                    ELSE (0)::numeric
                END AS base_rate
           FROM fpl_projection_leaguewide_allocation_v2 a
        )
 SELECT b.fixture_id,
    b.team_id,
    b.fpl_player_id,
    b.element_type,
    b.expected_minutes,
    b.prob_starting_xi,
        CASE
            WHEN (b.element_type = 1) THEN (0)::numeric
            ELSE LEAST(0.9, GREATEST((0)::numeric, (((b.prob_starting_xi * b.base_rate) * exp((0.28 * ((((COALESCE(h.events, (0)::numeric) + (b.prior90 * (5)::numeric)) / ((COALESCE(h.minutes, (0)::bigint) + 450))::numeric) * (90)::numeric) - b.prior90)))) * LEAST((1)::numeric, (b.expected_minutes / (60)::numeric)))))
        END AS defensive_contribution_probability,
        CASE
            WHEN (b.element_type = 2) THEN 10
            WHEN (b.element_type = ANY (ARRAY[3, 4])) THEN 12
            ELSE NULL::integer
        END AS threshold,
    (((COALESCE(h.events, (0)::numeric) + (b.prior90 * (5)::numeric)) / ((COALESCE(h.minutes, (0)::bigint) + 450))::numeric) * (90)::numeric) AS shrunk_events90
   FROM (b
     LEFT JOIN h ON (((h.fpl_player_id = b.fpl_player_id) AND (h.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))));
