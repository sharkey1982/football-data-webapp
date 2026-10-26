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
         SELECT se_first.season_id
           FROM seasons se_first
          WHERE (se_first.start_year = ( SELECT min(se_m.start_year) AS min
                   FROM seasons se_m
                  WHERE (se_m.season_id IN ( SELECT ts.season_id
                           FROM ts))))
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
   FROM (((ts t
     LEFT JOIN seasons se_t ON ((se_t.season_id = t.season_id)))
     LEFT JOIN seasons se_prev ON ((se_prev.start_year = (se_t.start_year - 1))))
     LEFT JOIN ts p ON (((p.team_id = t.team_id) AND (p.season_id = se_prev.season_id))));
