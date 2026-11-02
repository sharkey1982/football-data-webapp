-- Live definition exported from the database (view fpl_projection_secondary_scoring).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_secondary_scoring with (security_invoker=true) as
 WITH h AS (
         SELECT p.fpl_player_id,
            p.element_type,
            (COALESCE(sum(g.minutes), (0)::bigint))::numeric AS mins,
            (COALESCE(sum(g.saves), (0)::bigint))::numeric AS saves,
            (COALESCE(sum(g.yellow_cards), (0)::bigint))::numeric AS yc,
            (COALESCE(sum(g.red_cards), (0)::bigint))::numeric AS rc,
            (COALESCE(sum(g.own_goals), (0)::bigint))::numeric AS og,
            (COALESCE(sum(g.penalties_saved), (0)::bigint))::numeric AS ps,
            (COALESCE(sum(g.penalties_missed), (0)::bigint))::numeric AS pm
           FROM (fpl_players p
             LEFT JOIN fpl_player_gameweeks g ON (((g.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (g.fpl_player_id = p.fpl_player_id))))
          WHERE (p.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id))
          GROUP BY p.fpl_player_id, p.element_type
        ), b AS (
         SELECT a.fixture_id,
            a.team_id,
            a.fpl_player_id,
            a.element_type,
            a.expected_minutes,
            a.penalty_exposure,
            f.home_team_id,
            COALESCE(f.market_home_goals, f.predicted_home_goals) AS predicted_home_goals,
            COALESCE(f.market_away_goals, f.predicted_away_goals) AS predicted_away_goals,
            a.prob_starting_xi,
            a.prob_sub_appearance,
            COALESCE(eb.p_full, (1)::numeric) AS eb_full,
            COALESCE(eb.p_off_60_84, (0)::numeric) AS eb_mid,
            COALESCE(eb.p_off_before_60, (0)::numeric) AS eb_early,
            h.mins,
            h.saves,
            h.yc,
            h.rc,
            h.og,
            h.ps,
            h.pm
           FROM (((fpl_projection_leaguewide_allocation_v2 a
             JOIN fixtures f ON ((f.fixture_id = a.fixture_id)))
             JOIN h ON ((h.fpl_player_id = a.fpl_player_id)))
             LEFT JOIN fpl_player_exit_bands eb ON (((eb.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (eb.fpl_player_id = a.fpl_player_id))))
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
        CASE
            WHEN (element_type = 1) THEN ((((saves + (2.8846 * (5)::numeric)) / (mins + (450)::numeric)) * expected_minutes) / (3)::numeric)
            ELSE (0)::numeric
        END AS xpts_saves,
        CASE
            WHEN (element_type = ANY (ARRAY[1, 2])) THEN (- (((prob_starting_xi)::double precision * ((((eb_full)::double precision * ((
            CASE
                WHEN (team_id = home_team_id) THEN predicted_away_goals
                ELSE predicted_home_goals
            END / (2.0)::double precision) - (((1.0)::double precision - exp((('-2.0'::numeric)::double precision *
            CASE
                WHEN (team_id = home_team_id) THEN predicted_away_goals
                ELSE predicted_home_goals
            END))) / (4.0)::double precision))) + ((eb_mid)::double precision * (((
            CASE
                WHEN (team_id = home_team_id) THEN predicted_away_goals
                ELSE predicted_home_goals
            END * ((72.7 / 90.0))::double precision) / (2.0)::double precision) - (((1.0)::double precision - exp(((('-2.0'::numeric)::double precision *
            CASE
                WHEN (team_id = home_team_id) THEN predicted_away_goals
                ELSE predicted_home_goals
            END) * ((72.7 / 90.0))::double precision))) / (4.0)::double precision)))) + ((eb_early)::double precision * (((
            CASE
                WHEN (team_id = home_team_id) THEN predicted_away_goals
                ELSE predicted_home_goals
            END * ((47.0 / 90.0))::double precision) / (2.0)::double precision) - (((1.0)::double precision - exp(((('-2.0'::numeric)::double precision *
            CASE
                WHEN (team_id = home_team_id) THEN predicted_away_goals
                ELSE predicted_home_goals
            END) * ((47.0 / 90.0))::double precision))) / (4.0)::double precision))))) + ((prob_sub_appearance)::double precision * (((
            CASE
                WHEN (team_id = home_team_id) THEN predicted_away_goals
                ELSE predicted_home_goals
            END * ((18.2 / 90.0))::double precision) / (2.0)::double precision) - (((1.0)::double precision - exp(((('-2.0'::numeric)::double precision *
            CASE
                WHEN (team_id = home_team_id) THEN predicted_away_goals
                ELSE predicted_home_goals
            END) * ((18.2 / 90.0))::double precision))) / (4.0)::double precision)))))
            ELSE (0)::double precision
        END AS xpts_goals_conceded,
    ((((- ((yc + (0.35 * (5)::numeric)) / (mins + (450)::numeric))) * expected_minutes) - (((3)::numeric * ((rc + (0.03 * (5)::numeric)) / (mins + (450)::numeric))) * expected_minutes)) - (((2)::numeric * ((og + (0.02 * (5)::numeric)) / (mins + (450)::numeric))) * expected_minutes)) AS xpts_cards_own_goals,
    (
        CASE
            WHEN (element_type = 1) THEN (((5)::numeric * ((ps + (0.03 * (5)::numeric)) / (mins + (450)::numeric))) * expected_minutes)
            ELSE (0)::numeric
        END -
        CASE
            WHEN (penalty_exposure > (0)::numeric) THEN (((2)::numeric * ((pm + (0.02 * (5)::numeric)) / (mins + (450)::numeric))) * expected_minutes)
            ELSE (0)::numeric
        END) AS xpts_penalties
   FROM b;
