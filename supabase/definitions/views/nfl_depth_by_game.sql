-- Live definition exported from the database (view nfl_depth_by_game).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_depth_by_game with (security_invoker=true) as
 WITH team_games AS (
         SELECT g.game_id,
            g.season,
            g.week,
            g.game_type,
            g.gameday,
            g.home_code AS code
           FROM nfl.games g
        UNION ALL
         SELECT g.game_id,
            g.season,
            g.week,
            g.game_type,
            g.gameday,
            g.away_code
           FROM nfl.games g
        )
 SELECT tg.game_id,
    tg.season,
    tg.week,
    tg.gameday,
    tc.franchise AS team,
    w.player_id,
    w.player_name,
    w."position",
    w.slot,
    w.depth,
    'weekly'::text AS source,
    NULL::date AS as_of
   FROM ((team_games tg
     JOIN nfl.team_codes tc ON ((tc.code = tg.code)))
     JOIN nfl.depth_weekly w ON (((w.season = tg.season) AND (w.week = tg.week) AND (w.game_type = tg.game_type) AND (w.team IN ( SELECT c.code
           FROM nfl.team_codes c
          WHERE (c.franchise = tc.franchise))))))
UNION ALL
 SELECT tg.game_id,
    tg.season,
    tg.week,
    tg.gameday,
    tc.franchise AS team,
    d.player_id,
    d.player_name,
    d."position",
    (d.slot)::text AS slot,
    d.depth,
    'daily'::text AS source,
    d.as_of
   FROM (((team_games tg
     JOIN nfl.team_codes tc ON ((tc.code = tg.code)))
     JOIN LATERAL ( SELECT max(x.as_of) AS as_of
           FROM nfl.depth_daily x
          WHERE ((x.season = tg.season) AND (x.as_of <= tg.gameday) AND (x.team IN ( SELECT c.code
                   FROM nfl.team_codes c
                  WHERE (c.franchise = tc.franchise))))) last ON ((last.as_of IS NOT NULL)))
     JOIN nfl.depth_daily d ON (((d.as_of = last.as_of) AND (d.team IN ( SELECT c.code
           FROM nfl.team_codes c
          WHERE (c.franchise = tc.franchise))))));
