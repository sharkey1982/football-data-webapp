-- Live definition exported from the database (view nfl_points_allowed).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_points_allowed with (security_invoker=true) as
 WITH by_game AS (
         SELECT w.season,
            oc.franchise AS defence,
            w.game_id,
                CASE
                    WHEN (w."position" = 'FB'::text) THEN 'RB'::text
                    ELSE w."position"
                END AS "position",
            sum(nfl.points_std(w.*)) AS std,
            sum((nfl.points_std(w.*) + (w.receptions)::numeric)) AS ppr,
            sum((nfl.points_std(w.*) + (0.5 * (w.receptions)::numeric))) AS half
           FROM (nfl.player_weeks w
             JOIN nfl.team_codes oc ON ((oc.code = w.opponent)))
          WHERE (w.season_type = 'REG'::text)
          GROUP BY w.season, oc.franchise, w.game_id,
                CASE
                    WHEN (w."position" = 'FB'::text) THEN 'RB'::text
                    ELSE w."position"
                END
        ), agg AS (
         SELECT by_game.season,
            by_game.defence,
            by_game."position",
            count(*) AS games,
            round(avg(by_game.std), 2) AS std_per_game,
            round(avg(by_game.half), 2) AS half_per_game,
            round(avg(by_game.ppr), 2) AS ppr_per_game
           FROM by_game
          GROUP BY by_game.season, by_game.defence, by_game."position"
        )
 SELECT a.season,
    a.defence,
    a."position",
    a.games,
    a.std_per_game,
    a.half_per_game,
    a.ppr_per_game,
    f.slug AS defence_slug,
    f.name AS defence_name,
    f.short_name AS defence_short,
    rank() OVER (PARTITION BY a.season, a."position" ORDER BY a.ppr_per_game DESC) AS ppr_rank
   FROM (agg a
     JOIN nfl.franchises f ON ((f.franchise = a.defence)));
