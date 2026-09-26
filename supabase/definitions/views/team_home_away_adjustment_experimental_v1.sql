-- Live definition exported from the database (view team_home_away_adjustment_experimental_v1).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.team_home_away_adjustment_experimental_v1 as
 WITH params AS (
         SELECT (180.0)::double precision AS half_life_days,
            (12.0)::double precision AS shrink_matches
        ), latest_date AS (
         SELECT max(matches.match_date) AS as_of_date
           FROM matches
          WHERE ((matches.league_id = 1) AND (matches.full_time_home_goals IS NOT NULL))
        ), weighted AS (
         SELECT m.match_id,
            m.league_id,
            m.season_id,
            m.home_team_id,
            m.away_team_id,
            m.match_date,
            m.kickoff_time,
            m.referee,
            m.full_time_home_goals,
            m.full_time_away_goals,
            m.full_time_result,
            m.half_time_home_goals,
            m.half_time_away_goals,
            m.half_time_result,
            m.home_shots,
            m.away_shots,
            m.home_shots_on_target,
            m.away_shots_on_target,
            m.home_corners,
            m.away_corners,
            m.home_fouls,
            m.away_fouls,
            m.home_yellow_cards,
            m.away_yellow_cards,
            m.home_red_cards,
            m.away_red_cards,
            m.source_name,
            m.source_file,
            m.created_at,
            m.updated_at,
            m.round,
            m.round_number,
            m.stage,
            m.home_xg,
            m.away_xg,
            m.attendance,
            m.decided_by,
            m.winner_team_id,
            m.home_penalty_goals,
            m.away_penalty_goals,
            m.source_match_id,
            power((0.5)::double precision, ((GREATEST(0, (ld_1.as_of_date - m.match_date)))::double precision / p_1.half_life_days)) AS w
           FROM ((matches m
             CROSS JOIN params p_1)
             CROSS JOIN latest_date ld_1)
          WHERE ((m.league_id = 1) AND (m.full_time_home_goals IS NOT NULL) AND (m.full_time_away_goals IS NOT NULL) AND (m.match_date >= (ld_1.as_of_date - 730)))
        ), team_rows AS (
         SELECT weighted.home_team_id AS team_id,
            'home'::text AS venue,
            weighted.w,
            weighted.full_time_home_goals AS gf,
            weighted.full_time_away_goals AS ga
           FROM weighted
        UNION ALL
         SELECT weighted.away_team_id,
            'away'::text,
            weighted.w,
            weighted.full_time_away_goals,
            weighted.full_time_home_goals
           FROM weighted
        ), agg AS (
         SELECT team_rows.team_id,
            (sum((team_rows.w * (team_rows.gf)::double precision)) / NULLIF(sum(team_rows.w), (0)::double precision)) AS overall_gf,
            (sum((team_rows.w * (team_rows.ga)::double precision)) / NULLIF(sum(team_rows.w), (0)::double precision)) AS overall_ga,
            (sum((team_rows.w * (team_rows.gf)::double precision)) FILTER (WHERE (team_rows.venue = 'home'::text)) / NULLIF(sum(team_rows.w) FILTER (WHERE (team_rows.venue = 'home'::text)), (0)::double precision)) AS home_gf,
            (sum((team_rows.w * (team_rows.ga)::double precision)) FILTER (WHERE (team_rows.venue = 'home'::text)) / NULLIF(sum(team_rows.w) FILTER (WHERE (team_rows.venue = 'home'::text)), (0)::double precision)) AS home_ga,
            (sum((team_rows.w * (team_rows.gf)::double precision)) FILTER (WHERE (team_rows.venue = 'away'::text)) / NULLIF(sum(team_rows.w) FILTER (WHERE (team_rows.venue = 'away'::text)), (0)::double precision)) AS away_gf,
            (sum((team_rows.w * (team_rows.ga)::double precision)) FILTER (WHERE (team_rows.venue = 'away'::text)) / NULLIF(sum(team_rows.w) FILTER (WHERE (team_rows.venue = 'away'::text)), (0)::double precision)) AS away_ga,
            sum(team_rows.w) FILTER (WHERE (team_rows.venue = 'home'::text)) AS home_weight,
            sum(team_rows.w) FILTER (WHERE (team_rows.venue = 'away'::text)) AS away_weight,
            count(*) FILTER (WHERE (team_rows.venue = 'home'::text)) AS home_matches,
            count(*) FILTER (WHERE (team_rows.venue = 'away'::text)) AS away_matches
           FROM team_rows
          GROUP BY team_rows.team_id
        ), d AS (
         SELECT a.team_id,
            a.overall_gf,
            a.overall_ga,
            a.home_gf,
            a.home_ga,
            a.away_gf,
            a.away_ga,
            a.home_weight,
            a.away_weight,
            a.home_matches,
            a.away_matches,
            ln((GREATEST(a.home_gf, (0.15)::double precision) / GREATEST(a.overall_gf, (0.15)::double precision))) AS raw_home_attack_dev,
            ln((GREATEST(a.away_gf, (0.15)::double precision) / GREATEST(a.overall_gf, (0.15)::double precision))) AS raw_away_attack_dev,
            ln((GREATEST(a.overall_ga, (0.15)::double precision) / GREATEST(a.home_ga, (0.15)::double precision))) AS raw_home_defence_dev,
            ln((GREATEST(a.overall_ga, (0.15)::double precision) / GREATEST(a.away_ga, (0.15)::double precision))) AS raw_away_defence_dev
           FROM agg a
        )
 SELECT d.team_id,
    t.canonical_name AS team_name,
    d.overall_gf,
    d.home_gf,
    d.away_gf,
    d.overall_ga,
    d.home_ga,
    d.away_ga,
    d.home_matches,
    d.away_matches,
    d.home_weight,
    d.away_weight,
    (d.raw_home_attack_dev * (d.home_weight / (d.home_weight + p.shrink_matches))) AS home_attack_dev,
    (d.raw_away_attack_dev * (d.away_weight / (d.away_weight + p.shrink_matches))) AS away_attack_dev,
    (d.raw_home_defence_dev * (d.home_weight / (d.home_weight + p.shrink_matches))) AS home_defence_dev,
    (d.raw_away_defence_dev * (d.away_weight / (d.away_weight + p.shrink_matches))) AS away_defence_dev,
    p.half_life_days,
    p.shrink_matches,
    ld.as_of_date
   FROM (((d
     JOIN teams t ON ((t.team_id = d.team_id)))
     CROSS JOIN params p)
     CROSS JOIN latest_date ld);
