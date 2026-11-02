-- Live definition exported from the database (view fpl_defensive_contribution_projection_leaguewide).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_defensive_contribution_projection_leaguewide with (security_invoker=true) as
 WITH b AS (
         SELECT a.fixture_id,
            a.team_id,
            a.fpl_player_id,
            a.element_type,
            a.expected_minutes,
            a.prob_starting_xi,
            a.prob_sub_appearance,
                CASE a.element_type
                    WHEN 2 THEN '-0.331011'::numeric
                    WHEN 3 THEN '-0.156964'::numeric
                    WHEN 4 THEN '-0.156964'::numeric
                    ELSE NULL::numeric
                END AS beta,
                CASE
                    WHEN ((f.market_home_goals IS NOT NULL) AND (f.market_away_goals IS NOT NULL) AND ((f.market_home_goals + f.market_away_goals) > (0)::double precision)) THEN (
                    CASE
                        WHEN (a.team_id = f.home_team_id) THEN f.market_home_goals
                        ELSE f.market_away_goals
                    END / (f.market_home_goals + f.market_away_goals))
                    ELSE NULL::double precision
                END AS share
           FROM (fpl_projection_leaguewide_allocation_v2 a
             JOIN fixtures f ON ((f.fixture_id = a.fixture_id)))
        ), r AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            b.element_type,
            b.expected_minutes,
            b.prob_starting_xi,
            b.prob_sub_appearance,
            b.beta,
            b.share,
            fpl_defcon_rate90(b.element_type, (COALESCE(pr.minutes, 0))::numeric, (COALESCE(((pr.cbi + pr.tackles) +
                CASE
                    WHEN (b.element_type = 2) THEN 0
                    ELSE pr.recoveries
                END), 0))::numeric) AS rate90,
            COALESCE((pr.share_sum / (NULLIF(pr.share_minutes, 0))::numeric), 0.5) AS share_bar,
            eb.p_off_before_60,
            eb.p_off_60_84,
            eb.p_full
           FROM ((b
             LEFT JOIN fpl_defcon_player_rates pr ON (((pr.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (pr.fpl_player_id = b.fpl_player_id))))
             LEFT JOIN fpl_player_exit_bands eb ON (((eb.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (eb.fpl_player_id = b.fpl_player_id))))
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    element_type,
    expected_minutes,
    prob_starting_xi,
        CASE
            WHEN (element_type = ANY (ARRAY[2, 3, 4])) THEN round((fpl_defcon_probability(element_type, (rate90)::double precision, exp(((beta)::double precision * COALESCE((share - (share_bar)::double precision), (0)::double precision))), (prob_starting_xi)::double precision, (COALESCE(prob_sub_appearance, (0)::numeric))::double precision, (COALESCE(p_off_before_60, (0)::numeric))::double precision, (COALESCE(p_off_60_84, (0)::numeric))::double precision, (COALESCE(p_full, (1)::numeric))::double precision))::numeric, 6)
            ELSE (0)::numeric
        END AS defensive_contribution_probability,
        CASE
            WHEN (element_type = 2) THEN 10
            WHEN (element_type = ANY (ARRAY[3, 4])) THEN 12
            ELSE NULL::integer
        END AS threshold,
        CASE
            WHEN (element_type = ANY (ARRAY[2, 3, 4])) THEN rate90
            ELSE NULL::numeric
        END AS shrunk_events90
   FROM r;
