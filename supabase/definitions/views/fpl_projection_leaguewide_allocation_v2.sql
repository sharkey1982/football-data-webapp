-- Live definition exported from the database (view fpl_projection_leaguewide_allocation_v2).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_leaguewide_allocation_v2 with (security_invoker=true) as
 WITH x AS (
         SELECT i.fixture_id,
            i.team_id,
            i.fpl_player_id,
            i.expected_minutes,
            i.prob_starting_xi,
            i.prob_sub_appearance,
            i.availability_probability,
            i.real_tactical_role,
            i.web_name,
            i.element_type,
            i.season_minutes,
            i.raw_xg90,
            i.raw_xa90,
                CASE i.element_type
                    WHEN 2 THEN 0.0673
                    WHEN 3 THEN 0.1650
                    WHEN 4 THEN 0.4474
                    ELSE (0)::numeric
                END AS prior_xg90,
                CASE i.element_type
                    WHEN 1 THEN 0.0040
                    WHEN 2 THEN 0.0592
                    WHEN 3 THEN 0.1278
                    WHEN 4 THEN 0.0639
                    ELSE (0)::numeric
                END AS prior_xa90,
                CASE
                    WHEN (i.element_type = 1) THEN (0)::numeric
                    ELSE (((i.raw_xg90 * (i.season_minutes)::numeric) + (
                    CASE i.element_type
                        WHEN 2 THEN 0.0673
                        WHEN 3 THEN 0.1650
                        WHEN 4 THEN 0.4474
                        ELSE (0)::numeric
                    END * (900)::numeric)) / ((i.season_minutes + 900))::numeric)
                END AS shrunk_xg90,
            (((i.raw_xa90 * (i.season_minutes)::numeric) + (
                CASE i.element_type
                    WHEN 1 THEN 0.0040
                    WHEN 2 THEN 0.0592
                    WHEN 3 THEN 0.1278
                    WHEN 4 THEN 0.0639
                    ELSE (0)::numeric
                END * (900)::numeric)) / ((i.season_minutes + 900))::numeric) AS shrunk_xa90
           FROM fpl_projection_v4_leaguewide_inputs i
        ), b AS (
         SELECT x.fixture_id,
            x.team_id,
            x.fpl_player_id,
            x.expected_minutes,
            x.prob_starting_xi,
            x.prob_sub_appearance,
            x.availability_probability,
            x.real_tactical_role,
            x.web_name,
            x.element_type,
            x.season_minutes,
            x.raw_xg90,
            x.raw_xa90,
            x.prior_xg90,
            x.prior_xa90,
            x.shrunk_xg90,
            x.shrunk_xa90,
            (
                CASE
                    WHEN (x.team_id = f.home_team_id) THEN f.predicted_home_goals
                    ELSE f.predicted_away_goals
                END)::numeric AS team_xg,
            COALESCE(r.goal_weight, (1)::numeric) AS goal_weight,
            COALESCE(r.assist_weight, (1)::numeric) AS assist_weight,
            s.penalty_exposure,
            s.direct_fk_exposure,
            COALESCE(s.creation_exposure, (0)::numeric) AS creation_exposure
           FROM (((x
             JOIN fixtures f USING (fixture_id))
             LEFT JOIN tactical_role_priors r ON ((r.tactical_role = x.real_tactical_role)))
             LEFT JOIN fpl_set_piece_fixture_adjustments_v1 s ON (((s.fixture_id = x.fixture_id) AND (s.team_id = x.team_id) AND (s.fpl_player_id = x.fpl_player_id))))
        ), q AS (
         SELECT b.fixture_id,
            b.team_id,
            b.fpl_player_id,
            b.expected_minutes,
            b.prob_starting_xi,
            b.prob_sub_appearance,
            b.availability_probability,
            b.real_tactical_role,
            b.web_name,
            b.element_type,
            b.season_minutes,
            b.raw_xg90,
            b.raw_xa90,
            b.prior_xg90,
            b.prior_xa90,
            b.shrunk_xg90,
            b.shrunk_xa90,
            b.team_xg,
            b.goal_weight,
            b.assist_weight,
            b.penalty_exposure,
            b.direct_fk_exposure,
            b.creation_exposure,
            (((GREATEST(b.shrunk_xg90, 0.001) * sqrt(b.goal_weight)) * b.expected_minutes) / (90)::numeric) AS raw_goal_score,
            (((GREATEST(b.shrunk_xa90, 0.001) * sqrt(b.assist_weight)) * b.expected_minutes) / (90)::numeric) AS raw_assist_score
           FROM b
        ), n AS (
         SELECT q.fixture_id,
            q.team_id,
            q.fpl_player_id,
            q.expected_minutes,
            q.prob_starting_xi,
            q.prob_sub_appearance,
            q.availability_probability,
            q.real_tactical_role,
            q.web_name,
            q.element_type,
            q.season_minutes,
            q.raw_xg90,
            q.raw_xa90,
            q.prior_xg90,
            q.prior_xa90,
            q.shrunk_xg90,
            q.shrunk_xa90,
            q.team_xg,
            q.goal_weight,
            q.assist_weight,
            q.penalty_exposure,
            q.direct_fk_exposure,
            q.creation_exposure,
            q.raw_goal_score,
            q.raw_assist_score,
            (q.raw_goal_score / NULLIF(sum(q.raw_goal_score) OVER (PARTITION BY q.fixture_id, q.team_id), (0)::numeric)) AS base_goal_share,
            (q.raw_assist_score / NULLIF(sum(q.raw_assist_score) OVER (PARTITION BY q.fixture_id, q.team_id), (0)::numeric)) AS base_assist_share,
            (q.penalty_exposure / NULLIF(sum(q.penalty_exposure) OVER (PARTITION BY q.fixture_id, q.team_id), (0)::numeric)) AS pen_share_raw,
            (q.direct_fk_exposure / NULLIF(sum(q.direct_fk_exposure) OVER (PARTITION BY q.fixture_id, q.team_id), (0)::numeric)) AS fk_share_raw,
            (q.creation_exposure / NULLIF(sum(q.creation_exposure) OVER (PARTITION BY q.fixture_id, q.team_id), (0)::numeric)) AS sp_assist_share
           FROM q
        ), z AS (
         SELECT n.fixture_id,
            n.team_id,
            n.fpl_player_id,
            n.expected_minutes,
            n.prob_starting_xi,
            n.prob_sub_appearance,
            n.availability_probability,
            n.real_tactical_role,
            n.web_name,
            n.element_type,
            n.season_minutes,
            n.raw_xg90,
            n.raw_xa90,
            n.prior_xg90,
            n.prior_xa90,
            n.shrunk_xg90,
            n.shrunk_xa90,
            n.team_xg,
            n.goal_weight,
            n.assist_weight,
            n.penalty_exposure,
            n.direct_fk_exposure,
            n.creation_exposure,
            n.raw_goal_score,
            n.raw_assist_score,
            n.base_goal_share,
            n.base_assist_share,
            (((0.865 * n.base_goal_share) + (0.12 * COALESCE(n.pen_share_raw, n.base_goal_share))) + (0.015 * COALESCE(n.fk_share_raw, n.base_goal_share))) AS goal_share,
            ((n.base_assist_share * 0.88) + (COALESCE(n.sp_assist_share, n.base_assist_share) * 0.12)) AS assist_share
           FROM n
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    element_type,
    expected_minutes,
    prob_starting_xi,
    prob_sub_appearance,
    availability_probability,
    real_tactical_role,
    shrunk_xg90,
    shrunk_xa90,
    ((team_xg * goal_share) / NULLIF(sum(goal_share) OVER (PARTITION BY fixture_id, team_id), (0)::numeric)) AS expected_goals,
    (((team_xg * 0.72) * assist_share) / NULLIF(sum(assist_share) OVER (PARTITION BY fixture_id, team_id), (0)::numeric)) AS expected_assists,
    penalty_exposure,
    direct_fk_exposure
   FROM z;
