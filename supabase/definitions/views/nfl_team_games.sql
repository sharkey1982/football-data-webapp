-- Live definition exported from the database (view nfl_team_games).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_team_games with (security_invoker=true) as
 SELECT t.season,
    t.week,
    t.season_type,
    t.game_id,
    tc.franchise,
    oc.franchise AS opponent,
        CASE
            WHEN (hc.franchise = tc.franchise) THEN g.home_score
            ELSE g.away_score
        END AS points_for,
        CASE
            WHEN (hc.franchise = tc.franchise) THEN g.away_score
            ELSE g.home_score
        END AS points_against,
    ((t.attempts + t.sacks_suffered) + t.carries) AS plays,
    t.attempts,
    t.carries,
    t.completions,
    (t.passing_yards - t.sack_yards_lost) AS pass_yards_net,
    t.rushing_yards,
    t.passing_tds,
    t.rushing_tds,
    (t.passing_interceptions + t.fumbles_lost) AS giveaways,
    t.sacks_suffered,
    (t.passing_first_downs + t.rushing_first_downs) AS first_downs,
    t.passing_epa,
    t.rushing_epa,
    t.penalties,
    t.penalty_yards,
    t.def_sacks,
    (t.def_interceptions + t.fumble_recovery_opp) AS takeaways,
    (t.def_tds + t.special_teams_tds) AS def_st_tds,
    ((o.attempts + o.sacks_suffered) + o.carries) AS opp_plays,
    o.attempts AS opp_attempts,
    o.carries AS opp_carries,
    (o.passing_yards - o.sack_yards_lost) AS opp_pass_yards_net,
    o.rushing_yards AS opp_rushing_yards,
    o.passing_tds AS opp_passing_tds,
    o.rushing_tds AS opp_rushing_tds,
    nfl.dst_points(t.def_sacks, t.def_interceptions, t.fumble_recovery_opp, t.def_safeties, t.def_blocks, (t.def_tds + t.special_teams_tds),
        CASE
            WHEN (hc.franchise = tc.franchise) THEN g.away_score
            ELSE g.home_score
        END) AS dst_points,
    t.fg_made,
    t.fg_att,
    t.pat_made,
    o.fg_made AS opp_fg_made
   FROM (((((nfl.team_weeks t
     JOIN nfl.team_codes tc ON ((tc.code = t.team)))
     JOIN nfl.team_codes oc ON ((oc.code = t.opponent)))
     JOIN nfl.games g ON ((g.game_id = t.game_id)))
     JOIN nfl.team_codes hc ON ((hc.code = g.home_code)))
     LEFT JOIN nfl.team_weeks o ON (((o.game_id = t.game_id) AND (o.team = t.opponent))));
