-- Live definition exported from the database (view team_season_movement).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.team_season_movement as
 WITH ts AS (
         SELECT matches.league_id,
            matches.season_id,
            matches.home_team_id AS team_id
           FROM matches
          WHERE ((matches.league_id >= 1) AND (matches.league_id <= 5))
        UNION
         SELECT matches.league_id,
            matches.season_id,
            matches.away_team_id
           FROM matches
          WHERE ((matches.league_id >= 1) AND (matches.league_id <= 5))
        ), first_season AS (
         SELECT min(ts.season_id) AS season_id
           FROM ts
        )
 SELECT t.league_id,
    t.season_id,
    t.team_id,
    p.league_id AS previous_league_id,
        CASE
            WHEN (t.season_id = ( SELECT first_season.season_id
               FROM first_season)) THEN 'unknown'::text
            WHEN (p.league_id IS NULL) THEN 'new'::text
            WHEN (p.league_id > t.league_id) THEN 'promoted'::text
            WHEN (p.league_id < t.league_id) THEN 'relegated'::text
            ELSE 'stayed'::text
        END AS movement,
    ((t.season_id <> ( SELECT first_season.season_id
           FROM first_season)) AND ((p.league_id IS NULL) OR (p.league_id > t.league_id))) AS is_promoted
   FROM (ts t
     LEFT JOIN ts p ON (((p.team_id = t.team_id) AND (p.season_id = (t.season_id - 1)))));
