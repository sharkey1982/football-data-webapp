-- Live definition exported from the database (materialized_view team_season_summary).
-- Do not edit here: change it with a migration; the next export will reflect it.

create materialized view public.team_season_summary as
 WITH ls AS (
         SELECT l.league_id,
            l.league_code,
            l.league_name,
            l.tier,
            l.season_id,
            l.season_label,
            l.team_id,
            l."position",
            l.pyramid_position,
            l.teams,
            l.is_final,
            l.curtailed,
            l.ranked_on,
            l.played,
            l.won,
            l.drawn,
            l.lost,
            l.goals_for,
            l.goals_against,
            l.clean_sheets,
            l.failed_to_score,
            l.points_won,
            l.deduction,
            l.points,
            l.ppg,
            l.home_played,
            l.home_points,
            l.home_goals_for,
            l.home_goals_against,
            l.away_played,
            l.away_points,
            l.away_goals_for,
            l.away_goals_against,
            l.home_won,
            l.home_drawn,
            l.home_lost,
            l.home_clean_sheets,
            l.away_won,
            l.away_drawn,
            l.away_lost,
            l.away_clean_sheets,
            l.season_start_year,
            l.split_group,
            l.split_adjustment,
            s.start_year
           FROM ((league_standings l
             JOIN seasons s ON ((s.season_id = l.season_id)))
             JOIN leagues lg ON (((lg.league_id = l.league_id) AND (lg.competition_type = 'league'::text))))
        ), next_season AS (
         SELECT s.season_id,
            n.season_id AS next_season_id
           FROM (seasons s
             JOIN seasons n ON ((n.start_year = (s.start_year + 1))))
        ), games AS (
         SELECT ls_1.league_id,
            ls_1.season_id,
            max(ls_1.played) AS games_in_season,
            count(*) AS clubs
           FROM ls ls_1
          GROUP BY ls_1.league_id, ls_1.season_id
        )
 SELECT ls.league_id,
    ls.league_code,
    ls.league_name,
    ls.season_id,
    ls.season_label,
    ls.start_year,
    ls.team_id,
    ls."position",
    ls.teams,
    ls.is_final,
    ls.curtailed,
    ls.ranked_on,
    ls.played,
    ls.won,
    ls.drawn,
    ls.lost,
    ls.goals_for,
    ls.goals_against,
    (ls.goals_for - ls.goals_against) AS goal_difference,
    ls.clean_sheets,
    ls.failed_to_score,
    ls.points_won,
    ls.deduction,
    ls.points,
    ls.ppg,
    ls.home_played,
    ls.home_won,
    ls.home_drawn,
    ls.home_lost,
    ls.home_points,
    ls.home_goals_for,
    ls.home_goals_against,
    ls.away_played,
    ls.away_won,
    ls.away_drawn,
    ls.away_lost,
    ls.away_points,
    ls.away_goals_for,
    ls.away_goals_against,
    ls.split_group,
    g.games_in_season,
    g.clubs,
    ((g.clubs || 'x'::text) || (2 * (g.clubs - 1))) AS comparable_group,
    (EXISTS ( SELECT 1
           FROM league_season_formats f
          WHERE ((f.league_id = ls.league_id) AND (f.season_id = ls.season_id) AND (f.format = 'split'::text)))) AS split_format,
    (ls.is_final AND (ls."position" = 1)) AS champion,
        CASE
            WHEN ls.is_final THEN (ls."position" <= 4)
            ELSE NULL::boolean
        END AS top_four,
        CASE
            WHEN ls.is_final THEN (ls."position" <= 6)
            ELSE NULL::boolean
        END AS top_six,
    nxt.league_id AS next_league_id,
        CASE
            WHEN ((NOT ls.is_final) OR (NOT nx.next_known)) THEN NULL::boolean
            WHEN (((ls.league_id >= 1) AND (ls.league_id <= 5)) AND (nxt.league_id IS NULL)) THEN
            CASE
                WHEN (ls.league_id = 5) THEN true
                ELSE NULL::boolean
            END
            WHEN ((ls.league_id >= 1) AND (ls.league_id <= 5)) THEN (nxt.league_id > ls.league_id)
            ELSE (nxt.league_id IS NULL)
        END AS relegated,
        CASE
            WHEN ((NOT ls.is_final) OR (NOT nx.next_known)) THEN NULL::boolean
            WHEN ((ls.league_id >= 1) AND (ls.league_id <= 5)) THEN (nxt.league_id < ls.league_id)
            ELSE false
        END AS promoted
   FROM ((((ls
     JOIN games g ON (((g.league_id = ls.league_id) AND (g.season_id = ls.season_id))))
     LEFT JOIN next_season ns ON ((ns.season_id = ls.season_id)))
     LEFT JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
                   FROM ls l2
                  WHERE ((l2.season_id = ns.next_season_id) AND ((l2.league_id = ls.league_id) OR (((ls.league_id >= 1) AND (ls.league_id <= 5)) AND ((l2.league_id >= 1) AND (l2.league_id <= 5))))))) AS next_known) nx ON (true))
     LEFT JOIN LATERAL ( SELECT l3.league_id
           FROM ls l3
          WHERE ((l3.season_id = ns.next_season_id) AND (l3.team_id = ls.team_id) AND ((l3.league_id = ls.league_id) OR (((ls.league_id >= 1) AND (ls.league_id <= 5)) AND ((l3.league_id >= 1) AND (l3.league_id <= 5)))))
         LIMIT 1) nxt ON (true));
