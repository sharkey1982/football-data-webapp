-- Live definition exported from the database (view nfl_player_snaps).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_player_snaps with (security_invoker=true) as
 SELECT s.season,
    s.week,
    s.game_type,
    s.game_id,
    s.player_id,
    s.pfr_player_id,
    COALESCE(p.name, s.player_name) AS player_name,
    p.slug AS player_slug,
    s."position",
    tf.franchise AS team,
    tf.slug AS team_slug,
    opf.franchise AS opponent,
    s.offense_snaps,
    s.offense_pct,
    s.defense_snaps,
    s.defense_pct,
    s.st_snaps,
    s.st_pct,
    max(s.offense_snaps) OVER (PARTITION BY s.season, s.game_type, s.game_id, s.team) AS team_offense_snaps
   FROM (((((nfl.player_snaps s
     JOIN nfl.team_codes tc ON ((tc.code = s.team)))
     JOIN nfl.franchises tf ON ((tf.franchise = tc.franchise)))
     JOIN nfl.team_codes oc ON ((oc.code = s.opponent)))
     JOIN nfl.franchises opf ON ((opf.franchise = oc.franchise)))
     LEFT JOIN nfl.players p ON ((p.player_id = s.player_id)));
