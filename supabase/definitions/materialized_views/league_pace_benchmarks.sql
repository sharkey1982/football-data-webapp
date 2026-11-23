-- Live definition exported from the database (materialized_view league_pace_benchmarks).
-- Do not edit here: change it with a migration; the next export will reflect it.

create materialized view public.league_pace_benchmarks as
 WITH base AS (
         SELECT s.league_id,
            t.comparable_group,
            s.matches_played,
            s.points,
            t.champion,
            t.top_four,
            t.top_six,
            t.relegated
           FROM (team_match_snapshot s
             JOIN team_season_summary t USING (league_id, season_id, team_id))
          WHERE (t.is_final AND (NOT t.curtailed) AND (NOT t.split_format))
        ), grouped AS (
         SELECT base.league_id,
            base.comparable_group,
            base.matches_played,
            'all'::text AS outcome,
            base.points
           FROM base
        UNION ALL
         SELECT base.league_id,
            base.comparable_group,
            base.matches_played,
            'champion'::text,
            base.points
           FROM base
          WHERE base.champion
        UNION ALL
         SELECT base.league_id,
            base.comparable_group,
            base.matches_played,
            'top_four'::text,
            base.points
           FROM base
          WHERE base.top_four
        UNION ALL
         SELECT base.league_id,
            base.comparable_group,
            base.matches_played,
            'top_six'::text,
            base.points
           FROM base
          WHERE base.top_six
        UNION ALL
         SELECT base.league_id,
            base.comparable_group,
            base.matches_played,
            'relegated'::text,
            base.points
           FROM base
          WHERE base.relegated
        )
 SELECT league_id,
    comparable_group,
    matches_played,
    outcome,
    count(*) AS team_seasons,
    percentile_cont((0.10)::double precision) WITHIN GROUP (ORDER BY ((points)::double precision)) AS p10,
    percentile_cont((0.25)::double precision) WITHIN GROUP (ORDER BY ((points)::double precision)) AS p25,
    percentile_cont((0.50)::double precision) WITHIN GROUP (ORDER BY ((points)::double precision)) AS p50,
    percentile_cont((0.75)::double precision) WITHIN GROUP (ORDER BY ((points)::double precision)) AS p75,
    percentile_cont((0.90)::double precision) WITHIN GROUP (ORDER BY ((points)::double precision)) AS p90,
    min(points) AS min_points,
    max(points) AS max_points,
    avg(points) AS mean_points
   FROM grouped
  GROUP BY league_id, comparable_group, matches_played, outcome;
