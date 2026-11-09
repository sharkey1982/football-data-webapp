-- Live definition exported from the database (materialized_view history_streaks).
-- Do not edit here: change it with a migration; the next export will reflect it.

create materialized view public.history_streaks as
 WITH base AS (
         SELECT s.league_id,
            s.team_id,
            s.season_id,
            se.start_year,
            s.match_id,
            s.match_date,
            s.matches_played,
            s.result,
            s.goals_for,
            s.goals_against,
            (se.start_year - dense_rank() OVER (PARTITION BY s.league_id, s.team_id ORDER BY se.start_year)) AS spell
           FROM (team_match_snapshot s
             JOIN seasons se USING (season_id))
        ), typed AS (
         SELECT b.league_id,
            b.team_id,
            b.season_id,
            b.start_year,
            b.match_id,
            b.match_date,
            b.matches_played,
            b.result,
            b.goals_for,
            b.goals_against,
            b.spell,
            k.streak_type,
                CASE k.streak_type
                    WHEN 'won'::text THEN (b.result = 'W'::text)
                    WHEN 'unbeaten'::text THEN (b.result <> 'L'::text)
                    WHEN 'winless'::text THEN (b.result <> 'W'::text)
                    WHEN 'lost'::text THEN (b.result = 'L'::text)
                    WHEN 'scored'::text THEN (b.goals_for > 0)
                    WHEN 'clean_sheet'::text THEN (b.goals_against = 0)
                    WHEN 'no_goal'::text THEN (b.goals_for = 0)
                    ELSE NULL::boolean
                END AS ok
           FROM (base b
             CROSS JOIN ( VALUES ('won'::text), ('unbeaten'::text), ('winless'::text), ('lost'::text), ('scored'::text), ('clean_sheet'::text), ('no_goal'::text)) k(streak_type))
        ), islands AS (
         SELECT typed.league_id,
            typed.team_id,
            typed.season_id,
            typed.start_year,
            typed.match_id,
            typed.match_date,
            typed.matches_played,
            typed.result,
            typed.goals_for,
            typed.goals_against,
            typed.spell,
            typed.streak_type,
            typed.ok,
            (row_number() OVER (PARTITION BY typed.league_id, typed.team_id, typed.spell, typed.streak_type ORDER BY typed.match_date, typed.match_id) - row_number() OVER (PARTITION BY typed.league_id, typed.team_id, typed.spell, typed.streak_type, typed.ok ORDER BY typed.match_date, typed.match_id)) AS grp
           FROM typed
        ), runs AS (
         SELECT islands.league_id,
            islands.team_id,
            islands.streak_type,
            (count(*))::integer AS length,
            min(islands.match_date) AS start_date,
            max(islands.match_date) AS end_date,
            (array_agg(islands.season_id ORDER BY islands.match_date, islands.match_id))[1] AS start_season_id,
            (array_agg(islands.season_id ORDER BY islands.match_date DESC, islands.match_id DESC))[1] AS end_season_id,
            (array_agg(islands.match_id ORDER BY islands.match_date, islands.match_id))[1] AS start_match_id,
            (array_agg(islands.match_id ORDER BY islands.match_date DESC, islands.match_id DESC))[1] AS end_match_id,
            (array_agg(islands.matches_played ORDER BY islands.match_date, islands.match_id))[1] AS start_matches_played
           FROM islands
          WHERE islands.ok
          GROUP BY islands.league_id, islands.team_id, islands.spell, islands.streak_type, islands.grp
         HAVING (count(*) >= 3)
        ), last_match AS (
         SELECT team_match_snapshot.league_id,
            team_match_snapshot.team_id,
            max(team_match_snapshot.match_date) AS last_date
           FROM team_match_snapshot
          GROUP BY team_match_snapshot.league_id, team_match_snapshot.team_id
        ), league_edges AS (
         SELECT league_season_summary.league_id,
            (array_agg(league_season_summary.season_id ORDER BY league_season_summary.start_year))[1] AS first_season_id,
            (array_agg(league_season_summary.season_id ORDER BY league_season_summary.start_year DESC))[1] AS latest_season_id,
            (array_agg(league_season_summary.is_final ORDER BY league_season_summary.start_year DESC))[1] AS latest_is_final
           FROM league_season_summary
          GROUP BY league_season_summary.league_id
        )
 SELECT r.league_id,
    r.team_id,
    r.streak_type,
    r.length,
    r.start_date,
    r.end_date,
    r.start_season_id,
    r.end_season_id,
    r.start_match_id,
    r.end_match_id,
    ((r.end_season_id = e.latest_season_id) AND (NOT e.latest_is_final) AND (r.end_date = lm.last_date)) AS ongoing,
    ((r.start_season_id = e.first_season_id) AND (r.start_matches_played = 1)) AS truncated_start
   FROM ((runs r
     JOIN league_edges e USING (league_id))
     JOIN last_match lm USING (league_id, team_id));
