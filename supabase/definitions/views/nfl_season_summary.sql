-- Live definition exported from the database (view nfl_season_summary).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_season_summary with (security_invoker=true) as
 SELECT season,
    count(*) FILTER (WHERE (game_type = 'REG'::text)) AS reg_games,
    count(*) FILTER (WHERE ((game_type = 'REG'::text) AND (home_score IS NOT NULL))) AS reg_played,
    round(avg((home_score + away_score)) FILTER (WHERE (game_type = 'REG'::text)), 2) AS points_per_game,
    round(avg(
        CASE
            WHEN (home_score > away_score) THEN 1.0
            WHEN (home_score < away_score) THEN 0.0
            ELSE 0.5
        END) FILTER (WHERE ((game_type = 'REG'::text) AND (NOT neutral_site))), 3) AS home_win_share,
    round(avg(
        CASE
            WHEN (abs((home_score - away_score)) <= 8) THEN 1.0
            ELSE 0.0
        END) FILTER (WHERE (game_type = 'REG'::text)), 3) AS one_score_share,
    count(*) FILTER (WHERE ((game_type = 'REG'::text) AND overtime)) AS overtime_games,
    count(*) FILTER (WHERE ((game_type = 'REG'::text) AND (home_score = away_score))) AS ties,
    round(avg(
        CASE
            WHEN ((spread_line > (0)::numeric) AND (home_score > away_score)) THEN 1.0
            WHEN ((spread_line < (0)::numeric) AND (away_score > home_score)) THEN 1.0
            WHEN ((spread_line <> (0)::numeric) AND (home_score <> away_score)) THEN 0.0
            ELSE NULL::numeric
        END) FILTER (WHERE (game_type = 'REG'::text)), 3) AS favourite_win_share,
    count(*) FILTER (WHERE ((game_type = 'REG'::text) AND neutral_site)) AS neutral_games
   FROM nfl.games g
  WHERE (home_score IS NOT NULL)
  GROUP BY season;
