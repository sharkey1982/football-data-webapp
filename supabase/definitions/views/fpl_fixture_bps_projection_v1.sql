-- Live definition exported from the database (view fpl_fixture_bps_projection_v1).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_fixture_bps_projection_v1 with (security_invoker=true) as
 WITH hist AS (
         SELECT p.fpl_player_id,
            p.element_type,
            (COALESCE(sum(g.minutes), (0)::bigint))::numeric AS mins,
            (COALESCE(sum(g.bps), (0)::bigint))::numeric AS bps
           FROM (fpl_players p
             LEFT JOIN fpl_player_gameweeks g ON (((g.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (g.fpl_player_id = p.fpl_player_id))))
          WHERE (p.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id))
          GROUP BY p.fpl_player_id, p.element_type
        ), dc_usage AS (
         SELECT u.fpl_player_id,
            u.minutes AS dc_minutes,
            u.cbi,
            u.recoveries,
                CASE fp.element_type
                    WHEN 1 THEN 1.35
                    WHEN 2 THEN 6.00
                    WHEN 3 THEN 2.20
                    WHEN 4 THEN 1.21
                    ELSE 3.0
                END AS cbi_prior90,
                CASE fp.element_type
                    WHEN 1 THEN 8.62
                    WHEN 2 THEN 3.41
                    WHEN 3 THEN 4.19
                    WHEN 4 THEN 2.41
                    ELSE 4.0
                END AS recoveries_prior90
           FROM (fpl_player_defensive_contribution_usage u
             JOIN fpl_players fp ON (((fp.fpl_player_id = u.fpl_player_id) AND (fp.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))))
          WHERE (u.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id))
        ), base AS (
         SELECT a.fixture_id,
            a.team_id,
            a.fpl_player_id,
            a.element_type,
            a.expected_minutes,
            a.expected_goals,
            a.expected_assists,
            (exp((-
                CASE
                    WHEN (a.team_id = f.home_team_id) THEN f.predicted_away_goals
                    ELSE f.predicted_home_goals
                END)))::numeric AS clean_sheet_probability,
            (((COALESCE(dc.cbi, (0)::numeric) + (dc.cbi_prior90 * (5)::numeric)) / ((COALESCE(dc.dc_minutes, (0)::bigint) + 450))::numeric) * (90)::numeric) AS shrunk_cbi90,
            (((COALESCE(dc.recoveries, (0)::numeric) + (dc.recoveries_prior90 * (5)::numeric)) / ((COALESCE(dc.dc_minutes, (0)::bigint) + 450))::numeric) * (90)::numeric) AS shrunk_recoveries90,
            h.mins,
            h.bps,
                CASE a.element_type
                    WHEN 1 THEN 15.88
                    WHEN 2 THEN 19.27
                    WHEN 3 THEN 27.39
                    WHEN 4 THEN 33.24
                    ELSE (20)::numeric
                END AS prior_bps90
           FROM (((fpl_projection_leaguewide_allocation_v2 a
             JOIN fixtures f ON ((f.fixture_id = a.fixture_id)))
             JOIN hist h ON ((h.fpl_player_id = a.fpl_player_id)))
             LEFT JOIN dc_usage dc ON ((dc.fpl_player_id = a.fpl_player_id)))
        ), score AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            b.element_type,
            b.expected_minutes,
            b.expected_goals,
            b.expected_assists,
            b.clean_sheet_probability,
            (((b.shrunk_cbi90 + b.shrunk_recoveries90) * (b.expected_minutes / 90.0)) / 3.0) AS dc_bps,
            b.mins,
            b.bps,
            b.prior_bps90,
            (((((((b.bps + (b.prior_bps90 * (5)::numeric)) / (b.mins + (450)::numeric)) * b.expected_minutes) + (b.expected_goals * (
                CASE b.element_type
                    WHEN 1 THEN 12
                    WHEN 2 THEN 12
                    WHEN 3 THEN 18
                    WHEN 4 THEN 24
                    ELSE 18
                END)::numeric)) + (b.expected_assists * (9)::numeric)) + ((b.clean_sheet_probability * LEAST((1)::numeric, (b.expected_minutes / (60)::numeric))) * (
                CASE
                    WHEN (b.element_type = ANY (ARRAY[1, 2])) THEN 12
                    ELSE 0
                END)::numeric)) + (((b.shrunk_cbi90 + b.shrunk_recoveries90) * (b.expected_minutes / 90.0)) / 3.0)) AS expected_bps_score
           FROM base b
        ), ranked AS (
         SELECT s.fixture_id,
            s.team_id,
            s.fpl_player_id,
            s.element_type,
            s.expected_minutes,
            s.expected_goals,
            s.expected_assists,
            s.clean_sheet_probability,
            s.dc_bps,
            s.mins,
            s.bps,
            s.prior_bps90,
            s.expected_bps_score,
            row_number() OVER (PARTITION BY s.fixture_id ORDER BY s.expected_bps_score DESC) AS bps_rank
           FROM score s
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    element_type,
    expected_minutes,
    expected_bps_score,
    bps_rank,
    (
        CASE
            WHEN (bps_rank = 1) THEN 3
            WHEN (bps_rank = 2) THEN 2
            WHEN (bps_rank = 3) THEN 1
            ELSE 0
        END)::numeric AS deterministic_bonus,
    expected_goals,
    expected_assists,
    clean_sheet_probability
   FROM ranked;
