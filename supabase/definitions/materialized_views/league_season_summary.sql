-- Live definition exported from the database (materialized_view league_season_summary).
-- Do not edit here: change it with a migration; the next export will reflect it.

create materialized view public.league_season_summary as
 WITH m AS (
         SELECT m.league_id,
            m.season_id,
            m.full_time_home_goals AS hg,
            m.full_time_away_goals AS ag,
            (m.half_time_home_goals IS NOT NULL) AS has_ht,
            (m.home_shots IS NOT NULL) AS has_stats
           FROM (matches m
             JOIN leagues l ON (((l.league_id = m.league_id) AND (l.competition_type = 'league'::text))))
          WHERE ((m.full_time_home_goals IS NOT NULL) AND (m.full_time_away_goals IS NOT NULL))
        ), mm AS (
         SELECT m.league_id,
            m.season_id,
            count(*) AS matches,
            avg((m.hg + m.ag)) AS goals_per_game,
            avg(m.hg) AS home_goals_per_game,
            avg(m.ag) AS away_goals_per_game,
            avg(((m.hg > m.ag))::integer) AS home_win_share,
            avg(((m.hg = m.ag))::integer) AS draw_share,
            avg(((m.hg < m.ag))::integer) AS away_win_share,
            avg((((m.hg = 0) AND (m.ag = 0)))::integer) AS goalless_share,
            ((avg(((m.ag = 0))::integer) + avg(((m.hg = 0))::integer)) / (2)::numeric) AS clean_sheet_share,
            avg(abs((m.hg - m.ag))) FILTER (WHERE (m.hg <> m.ag)) AS avg_winning_margin,
            (avg(
                CASE
                    WHEN (m.hg > m.ag) THEN 3
                    WHEN (m.hg = m.ag) THEN 1
                    ELSE 0
                END) - avg(
                CASE
                    WHEN (m.ag > m.hg) THEN 3
                    WHEN (m.hg = m.ag) THEN 1
                    ELSE 0
                END)) AS home_ppg_advantage,
            avg((m.has_ht)::integer) AS half_time_coverage,
            avg((m.has_stats)::integer) AS stats_coverage
           FROM m
          GROUP BY m.league_id, m.season_id
        ), t AS (
         SELECT team_season_summary.league_id,
            team_season_summary.season_id,
            max(team_season_summary.league_code) AS league_code,
            max(team_season_summary.season_label) AS season_label,
            max(team_season_summary.start_year) AS start_year,
            max(team_season_summary.clubs) AS clubs,
            max(team_season_summary.games_in_season) AS games_in_season,
            max(team_season_summary.comparable_group) AS comparable_group,
            bool_and(team_season_summary.is_final) AS is_final,
            bool_or(team_season_summary.curtailed) AS curtailed,
            bool_or(team_season_summary.split_format) AS split_format,
            max(team_season_summary.points) FILTER (WHERE team_season_summary.champion) AS champion_points,
            max(team_season_summary.ppg) FILTER (WHERE team_season_summary.champion) AS champion_ppg,
            max(team_season_summary.points) FILTER (WHERE team_season_summary.relegated) AS highest_relegated_points,
            min(team_season_summary.points) FILTER (WHERE (team_season_summary.relegated = false)) AS lowest_safe_points,
            stddev_samp(team_season_summary.ppg) AS ppg_sd,
            ((stddev_samp((((team_season_summary.won)::numeric + (0.5 * (team_season_summary.drawn)::numeric)) / (NULLIF(team_season_summary.played, 0))::numeric)))::double precision / ((0.5)::double precision / sqrt((max(team_season_summary.games_in_season))::double precision))) AS noll_scully,
            (max(team_season_summary.points) - min(team_season_summary.points)) AS points_spread
           FROM team_season_summary
          GROUP BY team_season_summary.league_id, team_season_summary.season_id
        )
 SELECT t.league_id,
    t.season_id,
    t.league_code,
    t.season_label,
    t.start_year,
    t.clubs,
    t.games_in_season,
    t.comparable_group,
    t.is_final,
    t.curtailed,
    t.split_format,
    t.champion_points,
    t.champion_ppg,
    t.highest_relegated_points,
    t.lowest_safe_points,
    t.ppg_sd,
    t.noll_scully,
    t.points_spread,
    mm.matches,
    mm.goals_per_game,
    mm.home_goals_per_game,
    mm.away_goals_per_game,
    mm.home_win_share,
    mm.draw_share,
    mm.away_win_share,
    mm.goalless_share,
    mm.clean_sheet_share,
    mm.avg_winning_margin,
    mm.home_ppg_advantage,
    mm.half_time_coverage,
    mm.stats_coverage,
    (t.start_year = ANY (ARRAY[2019, 2020])) AS covid_affected
   FROM (t
     JOIN mm ON (((mm.league_id = t.league_id) AND (mm.season_id = t.season_id))));
