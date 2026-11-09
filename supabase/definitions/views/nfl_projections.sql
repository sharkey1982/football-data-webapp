-- Live definition exported from the database (view nfl_projections).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_projections with (security_invoker=true) as
 SELECT pr.game_id,
    pr.season,
    pr.week,
    g.kickoff_at,
    g.gameday,
    pr.player_id,
    p.slug AS player_slug,
    p.name AS player_name,
    pr."position",
    tf.franchise AS team,
    tf.slug AS team_slug,
    tf.short_name AS team_short,
    tf.name AS team_name,
    opf.franchise AS opponent,
    opf.slug AS opponent_slug,
    opf.short_name AS opponent_short,
    (g.home_code = pr.team) AS at_home,
    pr.method,
    pr.proj_ppr,
    pr.proj_half,
    pr.proj_std,
    pr.low_ppr,
    pr.high_ppr,
    pr.base_ppr,
    pr.season_avg_ppr,
    pr.team_implied,
    pr.team_usual,
    pr.opp_factor,
    pr.games_used,
    pr.injury_status,
    pr.injury,
    pr.practice_status,
    pr.computed_at
   FROM ((((((nfl.projections pr
     JOIN nfl.players p ON ((p.player_id = pr.player_id)))
     JOIN nfl.games g ON ((g.game_id = pr.game_id)))
     JOIN nfl.team_codes tc ON ((tc.code = pr.team)))
     JOIN nfl.franchises tf ON ((tf.franchise = tc.franchise)))
     JOIN nfl.team_codes oc ON ((oc.code = pr.opponent)))
     JOIN nfl.franchises opf ON ((opf.franchise = oc.franchise)));
