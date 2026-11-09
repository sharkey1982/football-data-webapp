-- Live definition exported from the database (view nfl_depth_latest).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_depth_latest with (security_invoker=true) as
 SELECT d.as_of,
    d.snapshot_at,
    d.season,
    tc.franchise AS team,
    d.player_id,
    COALESCE(p.name, d.player_name) AS player_name,
    p.slug AS player_slug,
    d."position",
    d.slot,
    d.depth
   FROM ((nfl.depth_daily d
     JOIN nfl.team_codes tc ON ((tc.code = d.team)))
     LEFT JOIN nfl.players p ON ((p.player_id = d.player_id)))
  WHERE (d.as_of = ( SELECT max(x.as_of) AS max
           FROM nfl.depth_daily x
          WHERE (x.team = d.team)));
