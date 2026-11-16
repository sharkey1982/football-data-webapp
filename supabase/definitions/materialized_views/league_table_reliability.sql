-- Live definition exported from the database (materialized_view league_table_reliability).
-- Do not edit here: change it with a migration; the next export will reflect it.

create materialized view public.league_table_reliability as
 WITH base AS (
         SELECT s.league_id,
            t.comparable_group,
            s.season_id,
            s.matches_played,
            s.position_at_played,
            t."position" AS final_position
           FROM (team_match_snapshot s
             JOIN team_season_summary t USING (league_id, season_id, team_id))
          WHERE (t.is_final AND (NOT t.curtailed) AND (NOT t.split_format))
        ), per_season AS (
         SELECT base.league_id,
            base.comparable_group,
            base.season_id,
            base.matches_played,
            corr((base.position_at_played)::double precision, (base.final_position)::double precision) AS rank_corr,
            avg(abs((base.position_at_played - base.final_position))) AS mean_abs_change,
            avg(((base.position_at_played = base.final_position))::integer) AS same_position_share
           FROM base
          GROUP BY base.league_id, base.comparable_group, base.season_id, base.matches_played
         HAVING (count(*) >= 4)
        )
 SELECT league_id,
    comparable_group,
    matches_played,
    count(*) AS seasons,
    avg(rank_corr) AS rank_correlation,
    avg(mean_abs_change) AS mean_abs_position_change,
    avg(same_position_share) AS same_position_share
   FROM per_season
  GROUP BY league_id, comparable_group, matches_played;
