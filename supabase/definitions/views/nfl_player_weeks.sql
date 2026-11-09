-- Live definition exported from the database (view nfl_player_weeks).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_player_weeks with (security_invoker=true) as
 SELECT w.player_id,
    p.slug AS player_slug,
    p.name AS player_name,
    w."position",
    w.season,
    w.week,
    w.season_type,
    w.game_id,
    tf.franchise AS team,
    opf.franchise AS opponent,
    opf.slug AS opponent_slug,
    opf.short_name AS opponent_short,
    (g.home_code = w.team) AS at_home,
    g.gameday,
    g.kickoff_at,
        CASE
            WHEN (g.home_code = w.team) THEN g.home_score
            ELSE g.away_score
        END AS team_score,
        CASE
            WHEN (g.home_code = w.team) THEN g.away_score
            ELSE g.home_score
        END AS opponent_score,
    w.completions,
    w.attempts,
    w.passing_yards,
    w.passing_tds,
    w.interceptions,
    w.sacks,
    w.carries,
    w.rushing_yards,
    w.rushing_tds,
    w.receptions,
    w.targets,
    w.receiving_yards,
    w.receiving_tds,
    w.fumbles_lost,
    ((w.passing_2pt + w.rushing_2pt) + w.receiving_2pt) AS two_pt,
    w.special_teams_tds,
    w.target_share,
    w.air_yards_share,
    w.wopr,
    ((w.fg_made_0_39 + w.fg_made_40_49) + w.fg_made_50_plus) AS fg_made,
    w.fg_att,
    w.pat_made,
    w.pat_missed,
    nfl.points_std(w.*) AS pts_std,
    (nfl.points_std(w.*) + (0.5 * (w.receptions)::numeric)) AS pts_half,
    (nfl.points_std(w.*) + (w.receptions)::numeric) AS pts_ppr
   FROM ((((((nfl.player_weeks w
     JOIN nfl.players p ON ((p.player_id = w.player_id)))
     JOIN nfl.games g ON ((g.game_id = w.game_id)))
     JOIN nfl.team_codes tc ON ((tc.code = w.team)))
     JOIN nfl.franchises tf ON ((tf.franchise = tc.franchise)))
     JOIN nfl.team_codes oc ON ((oc.code = w.opponent)))
     JOIN nfl.franchises opf ON ((opf.franchise = oc.franchise)));
